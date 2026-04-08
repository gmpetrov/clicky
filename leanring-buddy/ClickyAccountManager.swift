//
//  ClickyAccountManager.swift
//  leanring-buddy
//
//  Handles desktop authentication against the Next.js backend and tracks
//  whether the current user has an active subscription.
//

import AppKit
import Combine
import Foundation

@MainActor
final class ClickyAccountManager: ObservableObject {
    struct UserSummary: Decodable {
        let email: String
        let name: String?
    }

    struct SubscriptionSummary: Decodable {
        let plan: String
        let status: String?
        let periodEnd: Date?
    }

    @Published private(set) var isRefreshingAccount = false
    @Published private(set) var isAuthenticatingDevice = false
    @Published private(set) var isAuthenticated = false
    @Published private(set) var hasActiveSubscription = false
    @Published private(set) var currentUser: UserSummary?
    @Published private(set) var activeSubscription: SubscriptionSummary?
    @Published private(set) var currentErrorMessage: String?
    @Published private(set) var pendingDeviceUserCode: String?
    @Published private(set) var pendingVerificationURL: URL?

    var currentUserEmailAddress: String? {
        currentUser?.email
    }

    var currentPlanDisplayName: String {
        guard let plan = activeSubscription?.plan else {
            return "Starter"
        }

        return plan.capitalized
    }

    private struct BetterAuthErrorResponse: Decodable {
        let error: String?
        let error_description: String?
        let message: String?
    }

    private struct DeviceCodeResponse: Decodable {
        let device_code: String
        let user_code: String
        let verification_uri: String
        let verification_uri_complete: String
        let expires_in: Int
        let interval: Int
    }

    private struct DeviceTokenResponse: Decodable {
        let access_token: String
    }

    private struct DesktopAccountResponse: Decodable {
        let authenticated: Bool
        let isEntitled: Bool
        let user: UserSummary?
        let activeSubscription: SubscriptionSummary?
    }

    private let webBaseURL: URL
    private let desktopClientID: String
    private let session: URLSession
    private var deviceAuthorizationPollingTask: Task<Void, Never>?

    init() {
        let configuredWebBaseURL = AppBundleConfiguration.stringValue(forKey: "ClickyWebBaseURL")
            ?? "http://localhost:3000"
        self.webBaseURL = URL(string: configuredWebBaseURL)!
        self.desktopClientID = AppBundleConfiguration.stringValue(forKey: "ClickyDesktopClientID")
            ?? "clicky-macos"

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: configuration)
    }

    deinit {
        deviceAuthorizationPollingTask?.cancel()
    }

    func restoreStoredSessionIfNeeded() {
        guard ClickyDesktopSessionStore.loadBearerToken() != nil else {
            applySignedOutState()
            return
        }

        Task {
            await refreshAccountFromStoredToken()
        }
    }

    func startDeviceAuthorization() {
        currentErrorMessage = nil

        Task {
            await requestDeviceCode()
        }
    }

    func refreshAccount() {
        Task {
            await refreshAccountFromStoredToken()
        }
    }

    func signOut() {
        deviceAuthorizationPollingTask?.cancel()
        deviceAuthorizationPollingTask = nil
        ClickyDesktopSessionStore.clearBearerToken()
        applySignedOutState()
    }

    func openPendingVerificationPage() {
        guard let pendingVerificationURL else { return }
        NSWorkspace.shared.open(pendingVerificationURL)
    }

    func openPricingPage() {
        NSWorkspace.shared.open(webBaseURL.appending(path: "pricing"))
    }

    func openDashboardPage() {
        NSWorkspace.shared.open(webBaseURL.appending(path: "dashboard"))
    }

    func handleAccessRevoked() {
        Task {
            await refreshAccountFromStoredToken()
        }
    }

    private func requestDeviceCode() async {
        isAuthenticatingDevice = true
        currentErrorMessage = nil

        do {
            var request = URLRequest(url: webBaseURL.appending(path: "api/auth/device/code"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let requestBody: [String: Any] = [
                "client_id": desktopClientID,
                "scope": "openid profile email"
            ]

            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw ClickyAccountManagerError.invalidResponse
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                throw parseBackendError(from: data, fallbackMessage: "Pointerly could not start desktop sign-in.")
            }

            let deviceCodeResponse = try jsonDecoder.decode(DeviceCodeResponse.self, from: data)
            pendingDeviceUserCode = formattedUserCode(deviceCodeResponse.user_code)
            pendingVerificationURL = URL(string: deviceCodeResponse.verification_uri_complete)
                ?? URL(string: deviceCodeResponse.verification_uri)

            if let pendingVerificationURL {
                NSWorkspace.shared.open(pendingVerificationURL)
            }

            beginDeviceAuthorizationPolling(
                deviceCode: deviceCodeResponse.device_code,
                pollingIntervalSeconds: deviceCodeResponse.interval
            )
        } catch {
            isAuthenticatingDevice = false
            currentErrorMessage = error.localizedDescription
        }
    }

    private func beginDeviceAuthorizationPolling(
        deviceCode: String,
        pollingIntervalSeconds: Int
    ) {
        deviceAuthorizationPollingTask?.cancel()
        deviceAuthorizationPollingTask = Task {
            var currentPollingIntervalSeconds = max(1, pollingIntervalSeconds)

            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: UInt64(currentPollingIntervalSeconds) * 1_000_000_000)

                    let accessToken = try await pollForAccessToken(deviceCode: deviceCode)
                    ClickyDesktopSessionStore.saveBearerToken(accessToken)

                    pendingDeviceUserCode = nil
                    pendingVerificationURL = nil
                    isAuthenticatingDevice = false

                    await refreshAccountFromStoredToken()
                    return
                } catch let pollingError as ClickyDevicePollingError {
                    switch pollingError {
                    case .authorizationPending:
                        continue
                    case .slowDown:
                        currentPollingIntervalSeconds += 5
                    case .accessDenied:
                        pendingDeviceUserCode = nil
                        pendingVerificationURL = nil
                        isAuthenticatingDevice = false
                        currentErrorMessage = "Desktop sign-in was denied in the browser."
                        return
                    case .expiredToken:
                        pendingDeviceUserCode = nil
                        pendingVerificationURL = nil
                        isAuthenticatingDevice = false
                        currentErrorMessage = "That desktop sign-in code expired. Start again from Pointerly."
                        return
                    case .invalidGrant:
                        pendingDeviceUserCode = nil
                        pendingVerificationURL = nil
                        isAuthenticatingDevice = false
                        currentErrorMessage = "Pointerly could not complete desktop sign-in."
                        return
                    }
                } catch {
                    pendingDeviceUserCode = nil
                    pendingVerificationURL = nil
                    isAuthenticatingDevice = false
                    currentErrorMessage = error.localizedDescription
                    return
                }
            }
        }
    }

    private func pollForAccessToken(deviceCode: String) async throws -> String {
        var request = URLRequest(url: webBaseURL.appending(path: "api/auth/device/token"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let requestBody: [String: Any] = [
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": deviceCode,
            "client_id": desktopClientID
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClickyAccountManagerError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorResponse = try? jsonDecoder.decode(BetterAuthErrorResponse.self, from: data)
            switch errorResponse?.error {
            case "authorization_pending":
                throw ClickyDevicePollingError.authorizationPending
            case "slow_down":
                throw ClickyDevicePollingError.slowDown
            case "access_denied":
                throw ClickyDevicePollingError.accessDenied
            case "expired_token":
                throw ClickyDevicePollingError.expiredToken
            default:
                throw ClickyDevicePollingError.invalidGrant
            }
        }

        let tokenResponse = try jsonDecoder.decode(DeviceTokenResponse.self, from: data)
        return tokenResponse.access_token
    }

    private func refreshAccountFromStoredToken() async {
        guard let authorizationHeaderValue = ClickyDesktopSessionStore.authorizationHeaderValue() else {
            applySignedOutState()
            return
        }

        isRefreshingAccount = true
        currentErrorMessage = nil

        do {
            var request = URLRequest(url: webBaseURL.appending(path: "api/desktop/account"))
            request.httpMethod = "GET"
            request.setValue(authorizationHeaderValue, forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw ClickyAccountManagerError.invalidResponse
            }

            if httpResponse.statusCode == 401 {
                ClickyDesktopSessionStore.clearBearerToken()
                applySignedOutState()
                return
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                throw parseBackendError(from: data, fallbackMessage: "Pointerly could not refresh your account.")
            }

            let desktopAccountResponse = try jsonDecoder.decode(DesktopAccountResponse.self, from: data)
            isAuthenticated = desktopAccountResponse.authenticated
            hasActiveSubscription = desktopAccountResponse.isEntitled
            currentUser = desktopAccountResponse.user
            activeSubscription = desktopAccountResponse.activeSubscription
        } catch {
            currentErrorMessage = error.localizedDescription
        }

        isRefreshingAccount = false
    }

    private func applySignedOutState() {
        isRefreshingAccount = false
        isAuthenticatingDevice = false
        isAuthenticated = false
        hasActiveSubscription = false
        currentUser = nil
        activeSubscription = nil
        pendingDeviceUserCode = nil
        pendingVerificationURL = nil
    }

    private func parseBackendError(from data: Data, fallbackMessage: String) -> Error {
        if let errorResponse = try? jsonDecoder.decode(BetterAuthErrorResponse.self, from: data) {
            let message = errorResponse.error_description
                ?? errorResponse.message
                ?? fallbackMessage
            return ClickyAccountManagerError.backend(message: message)
        }

        return ClickyAccountManagerError.backend(message: fallbackMessage)
    }

    private func formattedUserCode(_ rawUserCode: String) -> String {
        guard rawUserCode.count > 4 else {
            return rawUserCode
        }

        let midpointIndex = rawUserCode.index(rawUserCode.startIndex, offsetBy: rawUserCode.count / 2)
        return "\(rawUserCode[..<midpointIndex])-\(rawUserCode[midpointIndex...])"
    }

    private var jsonDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private enum ClickyDevicePollingError: Error {
    case authorizationPending
    case slowDown
    case accessDenied
    case expiredToken
    case invalidGrant
}

private enum ClickyAccountManagerError: LocalizedError {
    case invalidResponse
    case backend(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Pointerly received an invalid response from the web app."
        case .backend(let message):
            return message
        }
    }
}
