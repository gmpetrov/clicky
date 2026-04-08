//
//  ClickyUsageMeteringClient.swift
//  leanring-buddy
//
//  Sends authenticated desktop usage events back to the Clicky web app so
//  billing-period cost aggregates can be computed server-side.
//

import Foundation

final class ClickyUsageMeteringClient {
    static let shared = ClickyUsageMeteringClient()

    private let webBaseURL: URL
    private let urlSession: URLSession
    private let iso8601Formatter = ISO8601DateFormatter()

    private init() {
        let configuredWebBaseURL = AppBundleConfiguration.stringValue(forKey: "ClickyWebBaseURL")
            ?? "http://localhost:3000"
        self.webBaseURL = URL(string: configuredWebBaseURL)!
        self.urlSession = URLSession(configuration: .default)
    }

    func reportAssemblyAIStreamingUsage(
        sessionIdentifier: String,
        sessionDurationSeconds: Double,
        keytermsEnabled: Bool,
        requestStartedAt: Date
    ) {
        guard sessionDurationSeconds > 0 else {
            return
        }

        guard let authorizationHeaderValue = ClickyDesktopSessionStore.authorizationHeaderValue() else {
            return
        }

        Task {
            do {
                var request = URLRequest(url: webBaseURL.appending(path: "api/desktop/usage-events"))
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue(authorizationHeaderValue, forHTTPHeaderField: "Authorization")

                let requestBody: [String: Any] = [
                    "provider": "assemblyai",
                    "operation": "streaming_transcription",
                    "model": "u3-rt-pro",
                    "idempotencyKey": "assemblyai:\(sessionIdentifier)",
                    "requestStartedAt": iso8601Formatter.string(from: requestStartedAt),
                    "requestCompletedAt": iso8601Formatter.string(from: Date()),
                    "rawUsage": [
                        "sessionDurationSeconds": sessionDurationSeconds,
                        "keytermsEnabled": keytermsEnabled
                    ]
                ]

                request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

                let (_, response) = try await urlSession.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse,
                      (200...299).contains(httpResponse.statusCode) else {
                    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
                    print("⚠️ ClickyUsageMeteringClient: failed to report AssemblyAI usage (HTTP \(statusCode))")
                    return
                }
            } catch {
                print("⚠️ ClickyUsageMeteringClient: failed to report AssemblyAI usage: \(error.localizedDescription)")
            }
        }
    }
}
