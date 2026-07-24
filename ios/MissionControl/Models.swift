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
    var notificationsMuted: Bool?
    var preview: String?

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

struct FileSuggestion: Decodable, Identifiable {
    let path: String
    var id: String { path }
}

struct SkillSuggestion: Decodable, Identifiable {
    let name: String
    let description: String?
    let source: String
    var id: String { name }
}

struct FileSuggestionsResponse: Decodable {
    let files: [FileSuggestion]
}

struct SkillSuggestionsResponse: Decodable {
    let skills: [SkillSuggestion]
}

struct SessionLinks: Codable {
    let claudeUrl: String?
    let prUrl: String?
}

struct TerminalSnapshot: Codable {
    let text: String
}

struct SessionActivity: Codable, Identifiable {
    let event: String
    let message: String
    let at: TimeInterval

    var id: String { "\(at)-\(event)-\(message)" }
    var date: Date { Date(timeIntervalSince1970: at / 1000) }
}

struct SessionActivityResponse: Codable {
    let activity: [SessionActivity]
}

struct NotificationSettings: Codable {
    let muted: Bool
}

// The structured conversation feed, parsed server-side from the session's Claude
// Code transcript. `available` is false for sessions without a transcript (plain
// shells, or Claude sessions running without the Mission Control hooks).
struct Conversation: Decodable {
    var available: Bool
    var title: String?
    var model: String?
    var todos: [ConversationTodo]
    var entries: [ConversationEntry]
}

struct ConversationTodo: Decodable {
    let content: String
    let status: String // pending | in_progress | completed
}

struct ConversationDiffLine: Decodable {
    let kind: String // add | del | ctx
    let text: String
}

struct ConversationEntry: Decodable, Identifiable {
    let id: String
    let kind: String // user | assistant | thinking | tool
    var text: String?
    var tool: String?
    var verb: String?
    var arg: String?
    var status: String? // ok | error
    var output: String?
    var file: String?
    var skill: String?
    var diff: [ConversationDiffLine]?
    var adds: Int?
    var dels: Int?
}

// CI status for a session's open pull request, from `gh pr checks`.
struct SessionChecks: Decodable {
    var available: Bool
    var checks: [CheckRun]
}

struct CheckRun: Decodable, Identifiable {
    let name: String
    let state: String // pass | fail | pending | skipping | cancel | ...
    var id: String { name }
}

struct ServerUpdateStatus: Codable {
    let state: String
    let message: String
    let updatedAt: TimeInterval
}

struct WorktreeInfo: Codable, Equatable {
    let isWorktree: Bool
    let path: String?
    let branch: String?
    let dirty: Bool?
}

struct Workspace: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let path: String
    let worktrees: [GitWorktree]
}

struct GitWorktree: Codable, Identifiable, Hashable {
    let path: String
    let branch: String?
    let isMain: Bool
    let dirty: Bool

    var id: String { path }
}

struct WorktreeCloseResult: Codable {
    let closedPaths: [String]
    let killedSessions: [String]
}

struct WorkspacesResponse: Codable {
    let workspaces: [Workspace]
}
