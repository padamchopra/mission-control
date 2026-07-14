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

    /// Uploads media to the server and returns its absolute path there, for the
    /// caller to reference in a message so Claude can read it.
    func upload(_ session: String, data: Data, filename: String, contentType: String) async throws -> String {
        var request = URLRequest(url: baseURL.appendingPathComponent("sessions/\(session)/upload"))
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue(filename, forHTTPHeaderField: "X-Filename")
        let (data, response) = try await URLSession.shared.upload(for: request, from: data)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        return try JSONDecoder().decode(UploadResponse.self, from: data).path
    }

    func links(_ session: String) async throws -> SessionLinks {
        let data = try await request("GET", "sessions/\(session)/links")
        return try JSONDecoder().decode(SessionLinks.self, from: data)
    }

    func worktree(_ session: String) async throws -> WorktreeInfo {
        let data = try await request("GET", "sessions/\(session)/worktree")
        return try JSONDecoder().decode(WorktreeInfo.self, from: data)
    }

    func removeWorktree(path: String, force: Bool) async throws {
        _ = try await request("POST", "worktree/remove", body: ["path": path, "force": force])
    }

    func workspaces() async throws -> [Workspace] {
        let data = try await request("GET", "workspaces")
        return try JSONDecoder().decode(WorkspacesResponse.self, from: data).workspaces
    }

    func addWorkspace(name: String, path: String) async throws {
        _ = try await request("POST", "workspaces", body: ["name": name, "path": path])
    }

    func saveWorkspace(fromSession session: String, name: String, path: String) async throws {
        _ = try await request("POST", "sessions/\(session)/workspace", body: ["name": name, "path": path])
    }

    /// The session's current directory on the server, for prefilling the
    /// save-as-workspace path field.
    func cwd(_ session: String) async throws -> String {
        let data = try await request("GET", "sessions/\(session)/cwd")
        return (try? JSONDecoder().decode(PathResponse.self, from: data))?.path ?? ""
    }

    func rename(_ session: String, to newName: String) async throws {
        _ = try await request("POST", "sessions/\(session)/rename", body: ["name": newName])
    }

    func removeWorkspace(id: String) async throws {
        _ = try await request("DELETE", "workspaces/\(id)")
    }

    @discardableResult
    func openSessionInWorkspace(id: String) async throws -> String {
        let data = try await request("POST", "workspaces/\(id)/session")
        return (try? JSONDecoder().decode([String: String].self, from: data)["name"]) ?? ""
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

    func notifyWebSocketURL() -> URL? {
        let streamURL = baseURL.appendingPathComponent("notify/stream")
        var components = URLComponents(url: streamURL, resolvingAgainstBaseURL: false)
        components?.scheme = baseURL.scheme == "https" ? "wss" : "ws"
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
