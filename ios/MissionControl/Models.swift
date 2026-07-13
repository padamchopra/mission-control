import Foundation

enum SessionState: String, Codable {
    case working
    case needsInput = "needs_input"
    case idle
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SessionState(rawValue: raw) ?? .unknown
    }
}

struct TmuxSession: Codable, Identifiable, Hashable {
    let name: String
    let createdAt: TimeInterval
    let lastOutputAt: TimeInterval
    let attachedClients: Int
    let paneCommand: String
    let panePath: String
    var state: SessionState?
    var detail: String?

    var id: String { name }
    var resolvedState: SessionState { state ?? .unknown }
    var lastOutputDate: Date { Date(timeIntervalSince1970: lastOutputAt) }
}

struct SessionsResponse: Codable {
    let sessions: [TmuxSession]
}

struct ModeResponse: Codable {
    let inCopyMode: Bool
}

struct UploadResponse: Codable {
    let path: String
}

struct PathResponse: Codable {
    let path: String?
}

struct SessionLinks: Codable {
    let claudeUrl: String?
    let prUrl: String?
}

struct WorktreeInfo: Codable {
    let isWorktree: Bool
    let path: String?
    let branch: String?
    let dirty: Bool?
}

struct Workspace: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let path: String
}

struct WorkspacesResponse: Codable {
    let workspaces: [Workspace]
}
