//
//  OpenRouterAPI.swift
//  leanring-buddy
//
//  Streams multimodal chat responses through the authenticated worker proxy.
//

import Foundation

final class OpenRouterAPI {
    private static let tlsWarmupLock = NSLock()
    private static var hasStartedTLSWarmup = false

    private let apiURL: URL
    private let session: URLSession
    private let authorizationHeaderProvider: @Sendable () -> String?
    var model: String

    init(
        proxyURL: String,
        model: String,
        authorizationHeaderProvider: @escaping @Sendable () -> String?
    ) {
        self.apiURL = URL(string: proxyURL)!
        self.model = model
        self.authorizationHeaderProvider = authorizationHeaderProvider

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 300
        configuration.waitsForConnectivity = true
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        self.session = URLSession(configuration: configuration)

        warmUpTLSConnectionIfNeeded()
    }

    func analyzeImageStreaming(
        images: [(data: Data, label: String)],
        systemPrompt: String,
        conversationHistory: [(userPlaceholder: String, assistantResponse: String)] = [],
        userPrompt: String,
        onTextChunk: @MainActor @Sendable (String) -> Void
    ) async throws -> (text: String, duration: TimeInterval) {
        let startTime = Date()
        var request = try makeAPIRequest()

        var messages: [[String: Any]] = [
            [
                "role": "system",
                "content": systemPrompt
            ]
        ]

        for (userPlaceholder, assistantResponse) in conversationHistory {
            messages.append(["role": "user", "content": userPlaceholder])
            messages.append(["role": "assistant", "content": assistantResponse])
        }

        var contentBlocks: [[String: Any]] = []
        for image in images {
            contentBlocks.append([
                "type": "text",
                "text": image.label
            ])
            contentBlocks.append([
                "type": "image_url",
                "image_url": [
                    "url": "data:\(detectImageMediaType(for: image.data));base64,\(image.data.base64EncodedString())"
                ]
            ])
        }
        contentBlocks.append([
            "type": "text",
            "text": userPrompt
        ])
        messages.append(["role": "user", "content": contentBlocks])

        let requestBody: [String: Any] = [
            "model": model,
            "stream": true,
            "max_tokens": 1024,
            "messages": messages
        ]

        let bodyData = try JSONSerialization.data(withJSONObject: requestBody)
        request.httpBody = bodyData

        let (byteStream, response) = try await session.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenRouterAPIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            var responseLines: [String] = []
            for try await line in byteStream.lines {
                responseLines.append(line)
            }
            throw OpenRouterAPIError.apiError(statusCode: httpResponse.statusCode, body: responseLines.joined(separator: "\n"))
        }

        var accumulatedResponseText = ""

        for try await line in byteStream.lines {
            guard line.hasPrefix("data: ") else { continue }

            let jsonString = String(line.dropFirst(6))
            guard jsonString != "[DONE]" else { break }

            guard let jsonData = jsonString.data(using: .utf8),
                  let payload = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                  let choices = payload["choices"] as? [[String: Any]],
                  let firstChoice = choices.first,
                  let delta = firstChoice["delta"] as? [String: Any] else {
                continue
            }

            if let textChunk = delta["content"] as? String {
                accumulatedResponseText += textChunk
                await onTextChunk(accumulatedResponseText)
                continue
            }

            if let contentBlocks = delta["content"] as? [[String: Any]] {
                let textChunk = contentBlocks.compactMap { contentBlock -> String? in
                    if let inlineText = contentBlock["text"] as? String {
                        return inlineText
                    }

                    if let contentType = contentBlock["type"] as? String,
                       contentType == "text",
                       let inlineText = contentBlock["text"] as? String {
                        return inlineText
                    }

                    return nil
                }.joined()

                if !textChunk.isEmpty {
                    accumulatedResponseText += textChunk
                    await onTextChunk(accumulatedResponseText)
                }
            }
        }

        return (
            text: accumulatedResponseText,
            duration: Date().timeIntervalSince(startTime)
        )
    }

    private func makeAPIRequest() throws -> URLRequest {
        guard let authorizationHeaderValue = authorizationHeaderProvider() else {
            throw OpenRouterAPIError.missingDesktopAccessToken
        }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorizationHeaderValue, forHTTPHeaderField: "Authorization")
        return request
    }

    private func detectImageMediaType(for imageData: Data) -> String {
        if imageData.count >= 4 {
            let pngSignature: [UInt8] = [0x89, 0x50, 0x4E, 0x47]
            let firstFourBytes = [UInt8](imageData.prefix(4))
            if firstFourBytes == pngSignature {
                return "image/png"
            }
        }

        return "image/jpeg"
    }

    private func warmUpTLSConnectionIfNeeded() {
        Self.tlsWarmupLock.lock()
        let shouldStartWarmup = !Self.hasStartedTLSWarmup
        if shouldStartWarmup {
            Self.hasStartedTLSWarmup = true
        }
        Self.tlsWarmupLock.unlock()

        guard shouldStartWarmup else { return }
        guard var warmupURLComponents = URLComponents(url: apiURL, resolvingAgainstBaseURL: false) else {
            return
        }

        warmupURLComponents.path = "/"
        warmupURLComponents.query = nil
        warmupURLComponents.fragment = nil

        guard let warmupURL = warmupURLComponents.url else {
            return
        }

        var warmupRequest = URLRequest(url: warmupURL)
        warmupRequest.httpMethod = "HEAD"
        warmupRequest.timeoutInterval = 10
        session.dataTask(with: warmupRequest) { _, _, _ in }.resume()
    }
}

private enum OpenRouterAPIError: CustomNSError, LocalizedError {
    case missingDesktopAccessToken
    case invalidResponse
    case apiError(statusCode: Int, body: String)

    static var errorDomain: String {
        "OpenRouterAPI"
    }

    var errorCode: Int {
        switch self {
        case .missingDesktopAccessToken:
            return 401
        case .invalidResponse:
            return -1
        case .apiError(let statusCode, _):
            return statusCode
        }
    }

    var errorDescription: String? {
        switch self {
        case .missingDesktopAccessToken:
            return "Sign in to Pointerly before asking the desktop companion to use the AI worker."
        case .invalidResponse:
            return "Pointerly received an invalid response from the AI worker."
        case .apiError(let statusCode, let body):
            return "AI worker error (\(statusCode)): \(body)"
        }
    }
}
