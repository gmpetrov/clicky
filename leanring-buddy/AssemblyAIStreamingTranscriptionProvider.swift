//
//  AssemblyAIStreamingTranscriptionProvider.swift
//  leanring-buddy
//
//  Streaming AI transcription provider backed by AssemblyAI's websocket API.
//

import AVFoundation
import Foundation

struct AssemblyAIStreamingTranscriptionProviderError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}

final class AssemblyAIStreamingTranscriptionProvider: BuddyTranscriptionProvider {
    /// URL for the Cloudflare Worker endpoint that returns a short-lived
    /// AssemblyAI streaming token. The real API key never leaves the server.
    private static var tokenProxyURL: String {
        let workerBaseURL = AppBundleConfiguration.stringValue(forKey: "ClickyWorkerBaseURL")
            ?? "http://localhost:8787"
        return "\(workerBaseURL)/transcribe-token"
    }

    let displayName = "AssemblyAI"
    let requiresSpeechRecognitionPermission = false

    var isConfigured: Bool { true }
    var unavailableExplanation: String? { nil }

    /// Single long-lived URLSession shared across all streaming sessions.
    /// Creating and invalidating a URLSession per session corrupts the OS
    /// connection pool and causes "Socket is not connected" errors after
    /// a few rapid reconnections to the same host.
    private let sharedWebSocketURLSession = URLSession(configuration: .default)

    func startStreamingSession(
        keyterms: [String],
        onTranscriptUpdate: @escaping (String) -> Void,
        onFinalTranscriptReady: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) async throws -> any BuddyStreamingTranscriptionSession {
        let session = AssemblyAIStreamingTranscriptionSession(
            temporaryTokenProvider: { [weak self] in
                guard let self else {
                    throw AssemblyAIStreamingTranscriptionProviderError(
                        message: "AssemblyAI token provider is no longer available."
                    )
                }

                return try await self.fetchTemporaryToken()
            },
            urlSession: sharedWebSocketURLSession,
            keyterms: keyterms,
            onTranscriptUpdate: onTranscriptUpdate,
            onFinalTranscriptReady: onFinalTranscriptReady,
            onError: onError
        )

        session.startConnecting()
        return session
    }

    /// Calls the Cloudflare Worker to get a short-lived AssemblyAI token.
    private func fetchTemporaryToken() async throws -> String {
        var request = URLRequest(url: URL(string: Self.tokenProxyURL)!)
        request.httpMethod = "POST"
        if let authorizationHeaderValue = ClickyDesktopSessionStore.authorizationHeaderValue() {
            request.setValue(authorizationHeaderValue, forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            if statusCode == 404 {
                throw AssemblyAIStreamingTranscriptionProviderError(
                    message: "Failed to fetch an AssemblyAI token from \(Self.tokenProxyURL) (HTTP 404). This usually means the Worker base URL is pointing at the wrong local server or the Worker is not running on that port."
                )
            }

            throw AssemblyAIStreamingTranscriptionProviderError(
                message: "Failed to fetch AssemblyAI token (HTTP \(statusCode)): \(body)"
            )
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["token"] as? String else {
            throw AssemblyAIStreamingTranscriptionProviderError(
                message: "Invalid token response from proxy."
            )
        }

        return token
    }
}

private final class AssemblyAIStreamingTranscriptionSession: NSObject, BuddyStreamingTranscriptionSession {
    private struct MessageEnvelope: Decodable {
        let type: String
    }

    private struct TurnMessage: Decodable {
        let type: String
        let transcript: String?
        let turn_order: Int?
        let end_of_turn: Bool?
        let turn_is_formatted: Bool?
    }

    private struct ErrorMessage: Decodable {
        let type: String
        let error: String?
        let message: String?
    }

    private struct TerminationMessage: Decodable {
        let type: String
        let session_duration_seconds: Double?
        let audio_duration_seconds: Double?
    }

    private struct StoredTurnTranscript {
        var transcriptText: String
        var isFormatted: Bool
    }

    private static let websocketBaseURLString = "wss://streaming.assemblyai.com/v3/ws"
    private static let targetSampleRate = 16_000.0
    private static let explicitFinalTranscriptGracePeriodSeconds = 2.2
    private static let forceEndpointDelaySeconds = 0.35
    private static let minTurnSilenceMilliseconds = 250
    private static let maxTurnSilenceMilliseconds = 2_000
    private static let maximumBufferedAudioChunkCount = 40

    let finalTranscriptFallbackDelaySeconds: TimeInterval = 2.8

    private let temporaryTokenProvider: @Sendable () async throws -> String
    private let keyterms: [String]
    private let onTranscriptUpdate: (String) -> Void
    private let onFinalTranscriptReady: (String) -> Void
    private let onError: (Error) -> Void

    private let stateQueue = DispatchQueue(label: "com.learningbuddy.assemblyai.state")
    private let sendQueue = DispatchQueue(label: "com.learningbuddy.assemblyai.send")
    private let audioPCM16Converter = BuddyPCM16AudioConverter(targetSampleRate: targetSampleRate)
    private let urlSession: URLSession

    private var webSocketTask: URLSessionWebSocketTask?
    private var connectionTask: Task<Void, Never>?
    private var hasDeliveredFinalTranscript = false
    private var isAwaitingExplicitFinalTranscript = false
    private var isCancelled = false
    private var latestTranscriptText = ""
    private var activeTurnOrder: Int?
    private var activeTurnTranscriptText = ""
    private var storedTurnTranscriptsByOrder: [Int: StoredTurnTranscript] = [:]
    private var explicitFinalTranscriptDeadlineWorkItem: DispatchWorkItem?
    private var pendingAudioChunks: [Data] = []
    private var pendingControlMessages: [String] = []
    private var isSocketReady = false
    private var hasReportedMeteredUsage = false
    private let meteringSessionIdentifier = UUID().uuidString
    private let requestStartedAt = Date()

    init(
        temporaryTokenProvider: @escaping @Sendable () async throws -> String,
        urlSession: URLSession,
        keyterms: [String],
        onTranscriptUpdate: @escaping (String) -> Void,
        onFinalTranscriptReady: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) {
        self.temporaryTokenProvider = temporaryTokenProvider
        self.urlSession = urlSession
        self.keyterms = keyterms
        self.onTranscriptUpdate = onTranscriptUpdate
        self.onFinalTranscriptReady = onFinalTranscriptReady
        self.onError = onError
    }

    func startConnecting() {
        connectionTask?.cancel()
        connectionTask = Task { [weak self] in
            guard let self else { return }

            do {
                let temporaryToken = try await temporaryTokenProvider()
                guard !Task.isCancelled else { return }
                print("🎙️ AssemblyAI: fetched temporary token (\(temporaryToken.prefix(20))...)")

                let websocketURL = try Self.makeWebsocketURL(
                    temporaryToken: temporaryToken,
                    keyterms: keyterms
                )

                let websocketRequest = URLRequest(url: websocketURL)
                let webSocketTask = urlSession.webSocketTask(with: websocketRequest)
                self.webSocketTask = webSocketTask
                webSocketTask.resume()
                self.receiveNextMessage()
            } catch {
                guard !Task.isCancelled else { return }
                self.failSession(with: error)
            }
        }
    }

    func appendAudioBuffer(_ audioBuffer: AVAudioPCMBuffer) {
        guard let audioPCM16Data = audioPCM16Converter.convertToPCM16Data(from: audioBuffer),
              !audioPCM16Data.isEmpty else {
            return
        }

        sendQueue.async { [weak self] in
            guard let self, !self.isCancelled else { return }

            guard self.isSocketReady, let webSocketTask = self.webSocketTask else {
                self.pendingAudioChunks.append(audioPCM16Data)
                if self.pendingAudioChunks.count > Self.maximumBufferedAudioChunkCount {
                    self.pendingAudioChunks.removeFirst(
                        self.pendingAudioChunks.count - Self.maximumBufferedAudioChunkCount
                    )
                }
                return
            }

            webSocketTask.send(.data(audioPCM16Data)) { [weak self] error in
                if let error {
                    self?.failSession(with: error)
                }
            }
        }
    }

    func requestFinalTranscript() {
        stateQueue.async {
            guard !self.hasDeliveredFinalTranscript else { return }
            self.isAwaitingExplicitFinalTranscript = true
            self.scheduleExplicitFinalTranscriptDeadline()
        }

        sendJSONMessage(
            ["type": "ForceEndpoint"],
            delaySeconds: Self.forceEndpointDelaySeconds
        )
    }

    func cancel() {
        stateQueue.async {
            self.explicitFinalTranscriptDeadlineWorkItem?.cancel()
            self.explicitFinalTranscriptDeadlineWorkItem = nil
        }

        sendQueue.async { [weak self] in
            self?.isCancelled = true
            self?.pendingAudioChunks.removeAll(keepingCapacity: false)
            self?.pendingControlMessages.removeAll(keepingCapacity: false)
        }

        connectionTask?.cancel()
        sendJSONMessage(["type": "Terminate"])
        webSocketTask?.cancel(with: .goingAway, reason: nil)
    }

    private func receiveNextMessage() {
        webSocketTask?.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleIncomingTextMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleIncomingTextMessage(text)
                    }
                @unknown default:
                    break
                }

                self.receiveNextMessage()
            case .failure(let error):
                self.failSession(with: error)
            }
        }
    }

    private func handleIncomingTextMessage(_ text: String) {
        guard let messageData = text.data(using: .utf8) else { return }

        do {
            let envelope = try JSONDecoder().decode(MessageEnvelope.self, from: messageData)

            switch envelope.type.lowercased() {
            case "begin":
                handleSocketReady()
            case "turn":
                let turnMessage = try JSONDecoder().decode(TurnMessage.self, from: messageData)
                handleTurnMessage(turnMessage)
            case "termination":
                let terminationMessage = try JSONDecoder().decode(TerminationMessage.self, from: messageData)
                handleTerminationMessage(terminationMessage)
            case "error":
                let errorMessage = try JSONDecoder().decode(ErrorMessage.self, from: messageData)
                let messageText = errorMessage.error ?? errorMessage.message ?? "AssemblyAI returned an error."
                failSession(with: AssemblyAIStreamingTranscriptionProviderError(message: messageText))
            default:
                break
            }
        } catch {
            failSession(with: error)
        }
    }

    private func handleTurnMessage(_ turnMessage: TurnMessage) {
        let transcriptText = turnMessage.transcript?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        stateQueue.async {
            let turnOrder = turnMessage.turn_order
                ?? self.activeTurnOrder
                ?? ((self.storedTurnTranscriptsByOrder.keys.max() ?? -1) + 1)

            if turnMessage.end_of_turn == true || turnMessage.turn_is_formatted == true {
                self.activeTurnOrder = nil
                self.activeTurnTranscriptText = ""
                self.storeTurnTranscript(
                    transcriptText,
                    forTurnOrder: turnOrder,
                    isFormatted: turnMessage.turn_is_formatted == true
                )
            } else {
                self.activeTurnOrder = turnOrder
                self.activeTurnTranscriptText = transcriptText
            }

            let fullTranscriptText = self.composeFullTranscript()
            self.latestTranscriptText = fullTranscriptText

            if !fullTranscriptText.isEmpty {
                self.onTranscriptUpdate(fullTranscriptText)
            }

            guard self.isAwaitingExplicitFinalTranscript else { return }

            if turnMessage.end_of_turn == true || turnMessage.turn_is_formatted == true {
                self.explicitFinalTranscriptDeadlineWorkItem?.cancel()
                self.explicitFinalTranscriptDeadlineWorkItem = nil
                self.deliverFinalTranscriptIfNeeded(self.bestAvailableTranscriptText())
            }
        }
    }

    private func handleTerminationMessage(_ terminationMessage: TerminationMessage) {
        stateQueue.async {
            let billedSessionDurationSeconds =
                terminationMessage.session_duration_seconds ?? terminationMessage.audio_duration_seconds

            if let billedSessionDurationSeconds,
               billedSessionDurationSeconds > 0,
               !self.hasReportedMeteredUsage {
                self.hasReportedMeteredUsage = true

                ClickyUsageMeteringClient.shared.reportAssemblyAIStreamingUsage(
                    sessionIdentifier: self.meteringSessionIdentifier,
                    sessionDurationSeconds: billedSessionDurationSeconds,
                    keytermsEnabled: !self.keyterms.isEmpty,
                    requestStartedAt: self.requestStartedAt
                )
            }

            if self.isAwaitingExplicitFinalTranscript && !self.hasDeliveredFinalTranscript {
                self.deliverFinalTranscriptIfNeeded(self.bestAvailableTranscriptText())
            }
        }
    }

    private func storeTurnTranscript(
        _ transcriptText: String,
        forTurnOrder turnOrder: Int,
        isFormatted: Bool
    ) {
        guard !transcriptText.isEmpty else { return }

        if let existingTurnTranscript = storedTurnTranscriptsByOrder[turnOrder] {
            if existingTurnTranscript.isFormatted && !isFormatted {
                return
            }
        }

        storedTurnTranscriptsByOrder[turnOrder] = StoredTurnTranscript(
            transcriptText: transcriptText,
            isFormatted: isFormatted
        )
    }

    private func composeFullTranscript() -> String {
        let committedTranscriptSegments = storedTurnTranscriptsByOrder
            .sorted(by: { $0.key < $1.key })
            .map(\.value.transcriptText)
            .filter { !$0.isEmpty }

        var transcriptSegments = committedTranscriptSegments

        let trimmedActiveTurnTranscriptText = activeTurnTranscriptText
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if !trimmedActiveTurnTranscriptText.isEmpty {
            transcriptSegments.append(trimmedActiveTurnTranscriptText)
        }

        return transcriptSegments.joined(separator: " ")
    }

    private func scheduleExplicitFinalTranscriptDeadline() {
        explicitFinalTranscriptDeadlineWorkItem?.cancel()

        let deadlineWorkItem = DispatchWorkItem { [weak self] in
            self?.stateQueue.async {
                guard let self else { return }
                self.deliverFinalTranscriptIfNeeded(self.bestAvailableTranscriptText())
            }
        }

        explicitFinalTranscriptDeadlineWorkItem = deadlineWorkItem

        DispatchQueue.main.asyncAfter(
            deadline: .now() + Self.explicitFinalTranscriptGracePeriodSeconds,
            execute: deadlineWorkItem
        )
    }

    private func deliverFinalTranscriptIfNeeded(_ transcriptText: String) {
        guard !hasDeliveredFinalTranscript else { return }
        hasDeliveredFinalTranscript = true
        explicitFinalTranscriptDeadlineWorkItem?.cancel()
        explicitFinalTranscriptDeadlineWorkItem = nil
        onFinalTranscriptReady(transcriptText)
        sendJSONMessage(["type": "Terminate"])
    }

    private func sendJSONMessage(
        _ payload: [String: Any],
        delaySeconds: TimeInterval = 0
    ) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        let sendWork = { [weak self] in
            guard let self, !self.isCancelled else { return }
            guard self.isSocketReady, let webSocketTask = self.webSocketTask else {
                self.pendingControlMessages.append(jsonString)
                return
            }
            webSocketTask.send(.string(jsonString)) { [weak self] error in
                if let error {
                    self?.failSession(with: error)
                }
            }
        }

        if delaySeconds > 0 {
            sendQueue.asyncAfter(deadline: .now() + delaySeconds, execute: sendWork)
        } else {
            sendQueue.async(execute: sendWork)
        }
    }

    private func handleSocketReady() {
        sendQueue.async { [weak self] in
            guard let self, !self.isCancelled else { return }
            self.isSocketReady = true

            guard let webSocketTask = self.webSocketTask else { return }

            let pendingAudioChunks = self.pendingAudioChunks
            self.pendingAudioChunks.removeAll(keepingCapacity: false)
            for pendingAudioChunk in pendingAudioChunks {
                webSocketTask.send(.data(pendingAudioChunk)) { [weak self] error in
                    if let error {
                        self?.failSession(with: error)
                    }
                }
            }

            let pendingControlMessages = self.pendingControlMessages
            self.pendingControlMessages.removeAll(keepingCapacity: false)
            for pendingControlMessage in pendingControlMessages {
                webSocketTask.send(.string(pendingControlMessage)) { [weak self] error in
                    if let error {
                        self?.failSession(with: error)
                    }
                }
            }
        }
    }

    private func failSession(with error: Error) {
        stateQueue.async {
            let latestTranscriptText = self.bestAvailableTranscriptText()

            if self.isAwaitingExplicitFinalTranscript
                && !self.hasDeliveredFinalTranscript
                && !latestTranscriptText.isEmpty {
                print("[AssemblyAI] ⚠️ WebSocket error during active session, delivering partial transcript as fallback: \(error.localizedDescription)")
                self.deliverFinalTranscriptIfNeeded(latestTranscriptText)
                return
            }
            print("[AssemblyAI] ❌ Session failed with error: \(error.localizedDescription)")

            self.onError(error)
        }
    }

    private func bestAvailableTranscriptText() -> String {
        let composedTranscriptText = composeFullTranscript()
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if !composedTranscriptText.isEmpty {
            return composedTranscriptText
        }

        return latestTranscriptText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func makeWebsocketURL(
        temporaryToken: String?,
        keyterms: [String]
    ) throws -> URL {
        guard var websocketURLComponents = URLComponents(string: websocketBaseURLString) else {
            throw AssemblyAIStreamingTranscriptionProviderError(
                message: "AssemblyAI websocket URL is invalid."
            )
        }

        var queryItems = [
            URLQueryItem(name: "sample_rate", value: "16000"),
            URLQueryItem(name: "encoding", value: "pcm_s16le"),
            URLQueryItem(name: "speech_model", value: "u3-rt-pro"),
            URLQueryItem(name: "min_turn_silence", value: "\(Self.minTurnSilenceMilliseconds)"),
            URLQueryItem(name: "max_turn_silence", value: "\(Self.maxTurnSilenceMilliseconds)")
        ]

        let normalizedKeyterms = keyterms
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        if !normalizedKeyterms.isEmpty,
           let keytermsData = try? JSONSerialization.data(withJSONObject: normalizedKeyterms),
           let keytermsJSONString = String(data: keytermsData, encoding: .utf8) {
            queryItems.append(URLQueryItem(name: "keyterms_prompt", value: keytermsJSONString))
        }

        if let temporaryToken {
            queryItems.append(URLQueryItem(name: "token", value: temporaryToken))
        }

        websocketURLComponents.queryItems = queryItems

        guard let websocketURL = websocketURLComponents.url else {
            throw AssemblyAIStreamingTranscriptionProviderError(
                message: "AssemblyAI websocket URL could not be created."
            )
        }

        return websocketURL
    }
}
