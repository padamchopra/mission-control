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
        let data = try await request("GET", "sessions", timeout: 20)
        return try JSONDecoder().decode(SessionsResponse.self, from: data).sessions
    }

    /// Every session on this server that's waiting on a decision, newest wait
    /// last. Cheap when nothing is waiting — it reads transcripts only for the
    /// sessions that are.
    func inbox() async throws -> [InboxItem] {
        let data = try await request("GET", "inbox", timeout: 20)
        return try JSONDecoder().decode(InboxResponse.self, from: data).items
    }

    func sessionState(_ session: String) async throws -> SessionStateResponse {
        let data = try await request("GET", "sessions/\(session)/state")
        return try JSONDecoder().decode(SessionStateResponse.self, from: data)
    }

    func sendText(_ session: String, text: String, submit: Bool = true) async throws {
        _ = try await request("POST", "sessions/\(session)/text", body: ["text": text, "submit": submit])
    }

    func sendKeys(_ session: String, keys: [String]) async throws {
        _ = try await request("POST", "sessions/\(session)/keys", body: ["keys": keys])
    }

    /// Pick a numbered option in an open prompt. The server re-reads the pane to
    /// find where the highlight actually is before moving it, and refuses if the
    /// screen no longer shows a choice — so a stale card can't answer the wrong
    /// question.
    func chooseOption(_ session: String, index: Int) async throws {
        _ = try await request("POST", "sessions/\(session)/choose", body: ["index": index])
    }

    func snapshot(_ session: String, lines: Int = 1_200) async throws -> String {
        let data = try await request(
            "GET",
            "sessions/\(session)/snapshot",
            query: [URLQueryItem(name: "lines", value: String(lines))]
        )
        return try JSONDecoder().decode(TerminalSnapshot.self, from: data).text
    }

    func activity(_ session: String) async throws -> [SessionActivity] {
        let data = try await request("GET", "sessions/\(session)/activity")
        return try JSONDecoder().decode(SessionActivityResponse.self, from: data).activity
    }

    func conversation(_ session: String, limit: Int = 120) async throws -> Conversation {
        let data = try await request(
            "GET",
            "sessions/\(session)/conversation",
            query: [URLQueryItem(name: "limit", value: String(limit))]
        )
        return try JSONDecoder().decode(Conversation.self, from: data)
    }

    func checks(_ session: String) async throws -> SessionChecks {
        let data = try await request("GET", "sessions/\(session)/checks")
        return try JSONDecoder().decode(SessionChecks.self, from: data)
    }

    @discardableResult
    func createPullRequest(_ session: String, title: String?, body: String?) async throws -> String {
        var payload: [String: Any] = [:]
        if let title, !title.isEmpty { payload["title"] = title }
        if let body, !body.isEmpty { payload["body"] = body }
        let data = try await request("POST", "sessions/\(session)/pr", body: payload)
        return (try? JSONDecoder().decode(PullRequestResult.self, from: data))?.url ?? ""
    }

    func mergePullRequest(_ session: String, auto: Bool) async throws {
        _ = try await request("POST", "sessions/\(session)/pr/merge", body: ["auto": auto])
    }

    func reviews(_ session: String) async throws -> [ReviewComment] {
        let data = try await request("GET", "sessions/\(session)/reviews")
        return (try? JSONDecoder().decode(ReviewsResponse.self, from: data))?.comments ?? []
    }

    @discardableResult
    func createSession(name: String?, path: String?, agent: AgentKind) async throws -> String {
        var payload: [String: Any] = [
            "agent": agent.rawValue,
            // An older server can still launch Claude from the same request.
            "claude": agent == .claude,
        ]
        if let name, !name.isEmpty { payload["name"] = name }
        if let path, !path.isEmpty { payload["path"] = path }
        let data = try await request("POST", "sessions", body: payload, timeout: 30)
        return (try? JSONDecoder().decode([String: String].self, from: data)["name"]) ?? ""
    }

    @discardableResult
    func createTask(workspaceID: String, prompt: String, agent: AgentKind) async throws -> String {
        let data = try await request(
            "POST",
            "workspaces/\(workspaceID)/task",
            body: ["prompt": prompt, "agent": agent.rawValue],
            timeout: 60
        )
        return (try? JSONDecoder().decode([String: String].self, from: data)["name"]) ?? ""
    }

    func setNotificationsMuted(_ session: String, muted: Bool) async throws {
        _ = try await request("POST", "sessions/\(session)/notifications", body: ["muted": muted])
    }

    func notificationsMuted(_ session: String) async throws -> Bool {
        let data = try await request("GET", "sessions/\(session)/notifications")
        return (try? JSONDecoder().decode(NotificationSettings.self, from: data))?.muted ?? false
    }

    /// The server's shared composer quick replies. Every client connected to the
    /// same server sees this one list.
    func quickReplies() async throws -> [String] {
        let data = try await request("GET", "quick-replies")
        return try JSONDecoder().decode(QuickRepliesResponse.self, from: data).replies
    }

    @discardableResult
    func saveQuickReplies(_ replies: [String]) async throws -> [String] {
        let data = try await request("PUT", "quick-replies", body: ["replies": replies])
        return try JSONDecoder().decode(QuickRepliesResponse.self, from: data).replies
    }

    func startServerUpdate() async throws -> ServerUpdateStatus {
        let data = try await request("POST", "server/update")
        return try JSONDecoder().decode(ServerUpdateStatus.self, from: data)
    }

    func serverUpdateStatus() async throws -> ServerUpdateStatus {
        let data = try await request("GET", "server/update")
        return try JSONDecoder().decode(ServerUpdateStatus.self, from: data)
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

    func links(
        _ session: String,
        refresh: Bool = false,
        includePullRequest: Bool = true
    ) async throws -> SessionLinks {
        var query: [URLQueryItem] = []
        if refresh { query.append(URLQueryItem(name: "refresh", value: "1")) }
        if !includePullRequest { query.append(URLQueryItem(name: "pr", value: "0")) }
        let data = try await request(
            "GET",
            "sessions/\(session)/links",
            query: query
        )
        return try JSONDecoder().decode(SessionLinks.self, from: data)
    }

    func worktree(_ session: String) async throws -> WorktreeInfo {
        let data = try await request("GET", "sessions/\(session)/worktree")
        return try JSONDecoder().decode(WorktreeInfo.self, from: data)
    }

    func removeWorktree(path: String, force: Bool) async throws {
        _ = try await request("POST", "worktree/remove", body: ["path": path, "force": force], timeout: 60)
    }

    func workspaces() async throws -> [Workspace] {
        let data = try await request("GET", "workspaces", timeout: 45)
        return try JSONDecoder().decode(WorkspacesResponse.self, from: data).workspaces
    }

    /// Per-worktree dirty state, computed on demand (kept out of the fast list).
    func worktreeDirty(workspaceID: String) async throws -> [String: Bool] {
        let data = try await request("GET", "workspaces/\(workspaceID)/dirty", timeout: 60)
        struct Response: Decodable { let dirty: [String: Bool] }
        return (try? JSONDecoder().decode(Response.self, from: data))?.dirty ?? [:]
    }

    func addWorkspace(name: String, path: String) async throws {
        _ = try await request("POST", "workspaces", body: ["name": name, "path": path], timeout: 45)
    }

    func saveWorkspace(fromSession session: String, name: String, path: String) async throws {
        _ = try await request("POST", "sessions/\(session)/workspace", body: ["name": name, "path": path], timeout: 45)
    }

    /// The session's current directory on the server, for prefilling the
    /// save-as-workspace path field.
    func cwd(_ session: String) async throws -> String {
        let data = try await request("GET", "sessions/\(session)/cwd")
        return (try? JSONDecoder().decode(PathResponse.self, from: data))?.path ?? ""
    }

    func files(_ session: String, matching query: String) async throws -> [FileSuggestion] {
        let data = try await request(
            "GET",
            "sessions/\(session)/files",
            query: [URLQueryItem(name: "q", value: query)]
        )
        return try JSONDecoder().decode(FileSuggestionsResponse.self, from: data).files
    }

    func skills(_ session: String, matching query: String) async throws -> [SkillSuggestion] {
        let data = try await request(
            "GET",
            "sessions/\(session)/skills",
            query: [URLQueryItem(name: "q", value: query)]
        )
        return try JSONDecoder().decode(SkillSuggestionsResponse.self, from: data).skills
    }

    func rename(_ session: String, to newName: String) async throws {
        _ = try await request("POST", "sessions/\(session)/rename", body: ["name": newName])
    }

    func removeWorkspace(id: String) async throws {
        _ = try await request("DELETE", "workspaces/\(id)")
    }

    @discardableResult
    func openSessionInWorkspace(id: String) async throws -> String {
        let data = try await request("POST", "workspaces/\(id)/session", timeout: 45)
        return (try? JSONDecoder().decode([String: String].self, from: data)["name"]) ?? ""
    }

    func closeWorktree(workspaceID: String, path: String, force: Bool) async throws -> WorktreeCloseResult {
        let data = try await request(
            "POST",
            "workspaces/\(workspaceID)/worktrees/close",
            body: ["path": path, "force": force],
            timeout: 60
        )
        return try JSONDecoder().decode(WorktreeCloseResult.self, from: data)
    }

    func closeAllWorktrees(workspaceID: String, force: Bool) async throws -> WorktreeCloseResult {
        let data = try await request(
            "POST",
            "workspaces/\(workspaceID)/worktrees/close-all",
            body: ["force": force],
            timeout: 60
        )
        return try JSONDecoder().decode(WorktreeCloseResult.self, from: data)
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

    /// - Parameter notifies: whether this client renders notifications itself.
    ///   The phone passes `false`: it wants the live-state pushes, but its
    ///   banners come from ntfy, so the server must not treat it as a delivery
    ///   target and go quiet on the phone.
    func notifyWebSocketURL(notifies: Bool) -> URL? {
        let streamURL = baseURL.appendingPathComponent("notify/stream")
        var components = URLComponents(url: streamURL, resolvingAgainstBaseURL: false)
        components?.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        if !notifies { components?.queryItems = [URLQueryItem(name: "notify", value: "0")] }
        return components?.url
    }

    private func request(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: [String: Any]? = nil,
        timeout: TimeInterval = 10
    ) async throws -> Data {
        var url = baseURL.appendingPathComponent(path)
        if !query.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.queryItems = query
            url = components?.url ?? url
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            // Prefer the server's own {error} message so validation failures
            // (e.g. saving a workspace) explain themselves.
            if let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"], !message.isEmpty {
                throw APIError.server(message)
            }
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        return data
    }
}

enum APIError: LocalizedError {
    case badStatus(Int)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .badStatus(let code):
            return "Server returned \(code)"
        case .server(let message):
            return message
        }
    }
}
