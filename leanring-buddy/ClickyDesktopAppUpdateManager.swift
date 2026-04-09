//
//  ClickyDesktopAppUpdateManager.swift
//  leanring-buddy
//
//  Checks the web app for the latest desktop release metadata and exposes a
//  simple "update available" state to the menu bar panel.
//

import AppKit
import Foundation

@MainActor
final class ClickyDesktopAppUpdateManager: ObservableObject {
    struct AvailableDesktopAppUpdate: Equatable {
        let currentVersion: String
        let currentBuildNumber: String?
        let latestVersion: String
        let latestBuildNumber: String?
        let minimumSupportedVersion: String?
        let downloadURL: URL
        let isRequired: Bool

        var currentVersionDisplayText: String {
            displayVersion(version: currentVersion, buildNumber: currentBuildNumber)
        }

        var latestVersionDisplayText: String {
            displayVersion(version: latestVersion, buildNumber: latestBuildNumber)
        }

        static func displayVersion(version: String, buildNumber: String?) -> String {
            guard let buildNumber, !buildNumber.isEmpty else {
                return version
            }

            return "\(version) (\(buildNumber))"
        }
    }

    @Published private(set) var availableDesktopAppUpdate: AvailableDesktopAppUpdate?
    @Published private(set) var isCheckingForDesktopAppUpdate = false
    @Published private(set) var currentStatusMessage: String?
    @Published private(set) var currentErrorMessage: String?

    var currentInstalledVersionDisplayText: String {
        AvailableDesktopAppUpdate.displayVersion(
            version: currentInstalledVersion,
            buildNumber: currentInstalledBuildNumber
        )
    }

    private struct LatestDesktopAppReleaseResponse: Decodable {
        let version: String
        let buildNumber: String?
        let minimumSupportedVersion: String?
        let downloadURL: URL
    }

    private struct BackendErrorResponse: Decodable {
        let message: String?
        let error: String?
    }

    private let webBaseURL: URL
    private let session: URLSession
    private var hasPresentedLaunchUpdatePrompt = false

    init() {
        let configuredWebBaseURL = AppBundleConfiguration.stringValue(forKey: "ClickyWebBaseURL")
            ?? "http://localhost:3000"
        self.webBaseURL = URL(string: configuredWebBaseURL)!

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        self.session = URLSession(configuration: configuration)
    }

    func checkForUpdatesOnLaunch() {
        Task {
            await fetchLatestDesktopAppUpdate(
                shouldAnnounceResultInPanel: false,
                shouldPresentPanelWhenUpdateIsAvailable: true
            )
        }
    }

    func refreshAvailableUpdate() {
        Task {
            await fetchLatestDesktopAppUpdate(
                shouldAnnounceResultInPanel: true,
                shouldPresentPanelWhenUpdateIsAvailable: false
            )
        }
    }

    func openDownloadPage() {
        guard let availableDesktopAppUpdate else { return }
        NSWorkspace.shared.open(availableDesktopAppUpdate.downloadURL)
    }

    private func fetchLatestDesktopAppUpdate(
        shouldAnnounceResultInPanel: Bool,
        shouldPresentPanelWhenUpdateIsAvailable: Bool
    ) async {
        isCheckingForDesktopAppUpdate = true

        if shouldAnnounceResultInPanel {
            currentStatusMessage = nil
            currentErrorMessage = nil
        }

        do {
            var request = URLRequest(url: webBaseURL.appending(path: "api/desktop/app-update"))
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw ClickyDesktopAppUpdateError.invalidResponse
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                throw parseBackendError(
                    from: data,
                    fallbackMessage: "Pointerly could not check for a desktop update."
                )
            }

            let latestDesktopAppReleaseResponse = try JSONDecoder().decode(
                LatestDesktopAppReleaseResponse.self,
                from: data
            )
            let availableDesktopAppUpdate = makeAvailableDesktopAppUpdate(
                from: latestDesktopAppReleaseResponse
            )

            self.availableDesktopAppUpdate = availableDesktopAppUpdate
            currentErrorMessage = nil

            if let availableDesktopAppUpdate {
                if shouldAnnounceResultInPanel {
                    currentStatusMessage = "Pointerly \(availableDesktopAppUpdate.latestVersionDisplayText) is ready to download."
                }

                if shouldPresentPanelWhenUpdateIsAvailable && !hasPresentedLaunchUpdatePrompt {
                    hasPresentedLaunchUpdatePrompt = true
                    NotificationCenter.default.post(name: .clickyShowPanel, object: nil)
                }
            } else if shouldAnnounceResultInPanel {
                currentStatusMessage = "Pointerly is up to date."
            }
        } catch {
            if shouldAnnounceResultInPanel {
                currentErrorMessage = error.localizedDescription
            }
        }

        isCheckingForDesktopAppUpdate = false
    }

    private func makeAvailableDesktopAppUpdate(
        from latestDesktopAppReleaseResponse: LatestDesktopAppReleaseResponse
    ) -> AvailableDesktopAppUpdate? {
        let currentInstalledReleaseVersion = ComparableReleaseVersion(currentInstalledVersion)
        let latestReleasedVersion = ComparableReleaseVersion(latestDesktopAppReleaseResponse.version)
        let currentInstalledBuildNumberValue = trimmedString(currentInstalledBuildNumber)
        let latestReleasedBuildNumberValue = trimmedString(latestDesktopAppReleaseResponse.buildNumber)
        let minimumSupportedVersionValue = trimmedString(latestDesktopAppReleaseResponse.minimumSupportedVersion)

        let isMarketingVersionUpdateAvailable = latestReleasedVersion > currentInstalledReleaseVersion
        let isBuildNumberUpdateAvailable = isBuildUpdateAvailable(
            currentInstalledReleaseVersion: currentInstalledReleaseVersion,
            latestReleasedVersion: latestReleasedVersion,
            currentInstalledBuildNumber: currentInstalledBuildNumberValue,
            latestReleasedBuildNumber: latestReleasedBuildNumberValue
        )

        let isRequiredUpdate = minimumSupportedVersionValue.map { minimumSupportedVersion in
            currentInstalledReleaseVersion < ComparableReleaseVersion(minimumSupportedVersion)
        } ?? false

        guard isMarketingVersionUpdateAvailable || isBuildNumberUpdateAvailable || isRequiredUpdate else {
            return nil
        }

        return AvailableDesktopAppUpdate(
            currentVersion: currentInstalledVersion,
            currentBuildNumber: currentInstalledBuildNumberValue,
            latestVersion: latestDesktopAppReleaseResponse.version,
            latestBuildNumber: latestReleasedBuildNumberValue,
            minimumSupportedVersion: minimumSupportedVersionValue,
            downloadURL: latestDesktopAppReleaseResponse.downloadURL,
            isRequired: isRequiredUpdate
        )
    }

    private func isBuildUpdateAvailable(
        currentInstalledReleaseVersion: ComparableReleaseVersion,
        latestReleasedVersion: ComparableReleaseVersion,
        currentInstalledBuildNumber: String?,
        latestReleasedBuildNumber: String?
    ) -> Bool {
        guard currentInstalledReleaseVersion == latestReleasedVersion else {
            return false
        }

        guard let currentInstalledBuildNumber,
              let latestReleasedBuildNumber else {
            return false
        }

        return ComparableReleaseVersion(latestReleasedBuildNumber)
            > ComparableReleaseVersion(currentInstalledBuildNumber)
    }

    private func parseBackendError(from data: Data, fallbackMessage: String) -> Error {
        if let backendErrorResponse = try? JSONDecoder().decode(BackendErrorResponse.self, from: data) {
            let message = backendErrorResponse.message
                ?? backendErrorResponse.error
                ?? fallbackMessage

            return ClickyDesktopAppUpdateError.backend(message: message)
        }

        return ClickyDesktopAppUpdateError.backend(message: fallbackMessage)
    }

    private func trimmedString(_ value: String?) -> String? {
        guard let value else { return nil }

        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedValue.isEmpty ? nil : trimmedValue
    }

    private var currentInstalledVersion: String {
        trimmedString(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
            ?? "0"
    }

    private var currentInstalledBuildNumber: String? {
        trimmedString(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
    }
}

private struct ComparableReleaseVersion: Comparable {
    private let numericComponents: [Int]

    init(_ rawValue: String) {
        let parsedComponents = rawValue
            .split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }

        self.numericComponents = parsedComponents.isEmpty ? [0] : parsedComponents
    }

    static func < (lhs: ComparableReleaseVersion, rhs: ComparableReleaseVersion) -> Bool {
        let maxComponentCount = max(lhs.numericComponents.count, rhs.numericComponents.count)

        for componentIndex in 0..<maxComponentCount {
            let leftComponent = componentIndex < lhs.numericComponents.count
                ? lhs.numericComponents[componentIndex]
                : 0
            let rightComponent = componentIndex < rhs.numericComponents.count
                ? rhs.numericComponents[componentIndex]
                : 0

            if leftComponent != rightComponent {
                return leftComponent < rightComponent
            }
        }

        return false
    }
}

private enum ClickyDesktopAppUpdateError: LocalizedError {
    case invalidResponse
    case backend(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Pointerly received an invalid desktop update response."
        case .backend(let message):
            return message
        }
    }
}
