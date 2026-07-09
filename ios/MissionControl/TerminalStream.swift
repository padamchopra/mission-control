import Foundation

enum StreamState: Equatable {
    case connecting
    case connected
    case reconnecting(attempt: Int, maxAttempts: Int)
    case failed
}

/// WebSocket connection to the server's PTY stream for one tmux session.
/// Terminal bytes arrive as frames; input/resize go out as JSON control frames.
/// On an unexpected drop it retries with exponential backoff, then surfaces
/// `.failed` so the UI can offer a manual retry. tmux holds the session
/// server-side, so a reconnect simply re-attaches and repaints.
final class TerminalStream: NSObject, URLSessionWebSocketDelegate {
    var onBytes: (([UInt8]) -> Void)?
    var onStateChange: ((StreamState) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var url: URL?
    private var token = ""
    private var attempt = 0
    private var manuallyClosed = false
    private var reconnectWork: DispatchWorkItem?

    private let maxAttempts = 6
    private let baseDelay = 0.5
    private let maxDelay = 10.0

    func connect(url: URL, token: String) {
        self.url = url
        self.token = token
        manuallyClosed = false
        attempt = 0
        openSocket(announcing: .connecting)
    }

    /// Manual retry after giving up — resets backoff and starts fresh.
    func retry() {
        guard let url else { return }
        connect(url: url, token: token)
    }

    func sendInput(_ text: String) {
        sendJSON(["type": "input", "data": text])
    }

    func resize(cols: Int, rows: Int) {
        sendJSON(["type": "resize", "cols": cols, "rows": rows])
    }

    func disconnect() {
        manuallyClosed = true
        reconnectWork?.cancel()
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
    }

    private func openSocket(announcing state: StreamState) {
        guard let url else { return }
        onStateChange?(state)
        task?.cancel(with: .goingAway, reason: nil)
        session?.invalidateAndCancel()

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
        self.session = session
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        receive(on: task)
    }

    private func scheduleReconnect() {
        guard !manuallyClosed else { return }
        attempt += 1
        if attempt > maxAttempts {
            onStateChange?(.failed)
            return
        }
        onStateChange?(.reconnecting(attempt: attempt, maxAttempts: maxAttempts))
        let delay = min(maxDelay, baseDelay * pow(2, Double(attempt - 1)))
        let work = DispatchWorkItem { [weak self] in
            self?.openSocket(announcing: .reconnecting(attempt: self?.attempt ?? 0, maxAttempts: self?.maxAttempts ?? 0))
        }
        reconnectWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func sendJSON(_ object: [String: Any]) {
        guard let task,
              let data = try? JSONSerialization.data(withJSONObject: object),
              let string = String(data: data, encoding: .utf8) else { return }
        task.send(.string(string)) { _ in }
    }

    private func receive(on task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self, task === self.task else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.onBytes?(Array(text.utf8))
                case .data(let data):
                    self.onBytes?([UInt8](data))
                @unknown default:
                    break
                }
                self.receive(on: task)
            case .failure:
                if !self.manuallyClosed {
                    self.scheduleReconnect()
                }
            }
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        guard webSocketTask === task else { return }
        attempt = 0
        onStateChange?(.connected)
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        guard webSocketTask === task, !manuallyClosed else { return }
        scheduleReconnect()
    }
}
