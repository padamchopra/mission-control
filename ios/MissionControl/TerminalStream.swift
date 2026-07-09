import Foundation

/// WebSocket connection to the server's PTY stream for one tmux session.
/// Terminal bytes arrive as frames; input/resize go out as JSON control frames.
final class TerminalStream: NSObject, URLSessionWebSocketDelegate {
    var onBytes: (([UInt8]) -> Void)?
    var onStateChange: ((Bool) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?

    func connect(url: URL, token: String) {
        disconnect()
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
        self.session = session
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        receive(on: task)
    }

    func sendInput(_ text: String) {
        sendJSON(["type": "input", "data": text])
    }

    func resize(cols: Int, rows: Int) {
        sendJSON(["type": "resize", "cols": cols, "rows": rows])
    }

    func disconnect() {
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        session?.finishTasksAndInvalidate()
        session = nil
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
                self.onStateChange?(false)
            }
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        onStateChange?(true)
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        onStateChange?(false)
    }
}
