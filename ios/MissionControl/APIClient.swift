import Foundation

struct APIClient {
    let baseURL: URL
    let token: String

    init?(urlString: String, token: String) {
        guard let url = URL(string: urlString), url.scheme != nil, !token.isEmpty else { return nil }
        baseURL = url
        self.token = token
    }

    func health() async throws {
        _ = try await request("GET", "health")
    }

    func sessions() async throws -> [TmuxSession] {
        let data = try await request("GET", "sessions")
        return try JSONDecoder().decode(SessionsResponse.self, from: data).sessions
    }

    func sendText(_ session: String, text: String, submit: Bool = true) async throws {
        _ = try await request("POST", "sessions/\(session)/text", body: ["text": text, "submit": submit])
    }

    func sendKeys(_ session: String, keys: [String]) async throws {
        _ = try await request("POST", "sessions/\(session)/keys", body: ["keys": keys])
    }

    /// Scrolls the session and returns whether it's still in copy-mode (scrolled
    /// up), so the caller can show/hide the jump-to-bottom control.
    @discardableResult
    func scroll(_ session: String, action: String, lines: Int = 1) async throws -> Bool {
        let data = try await request("POST", "sessions/\(session)/scroll", body: ["action": action, "lines": lines])
        return (try? JSONDecoder().decode(ModeResponse.self, from: data))?.inCopyMode ?? false
    }

    func inCopyMode(_ session: String) async throws -> Bool {
        let data = try await request("GET", "sessions/\(session)/mode")
        return (try? JSONDecoder().decode(ModeResponse.self, from: data))?.inCopyMode ?? false
    }

    func kill(_ session: String) async throws {
        _ = try await request("DELETE", "sessions/\(session)")
    }

    func webSocketURL(session: String, cols: Int, rows: Int) -> URL? {
        let streamURL = baseURL.appendingPathComponent("sessions/\(session)/stream")
        var components = URLComponents(url: streamURL, resolvingAgainstBaseURL: false)
        components?.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components?.queryItems = [
            URLQueryItem(name: "cols", value: String(cols)),
            URLQueryItem(name: "rows", value: String(rows)),
        ]
        return components?.url
    }

    private func request(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 10
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        return data
    }
}

enum APIError: LocalizedError {
    case badStatus(Int)

    var errorDescription: String? {
        switch self {
        case .badStatus(let code):
            return "Server returned \(code)"
        }
    }
}
