import Foundation

enum AgentKind: String, Codable, CaseIterable, Identifiable {
    case shell
    case claude
    case codex

    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .shell: return "Shell"
        case .claude: return "Claude"
        case .codex: return "Codex"
        }
    }
    var systemImage: String {
        switch self {
        case .shell: return "terminal"
        case .claude: return "sparkles"
        case .codex: return "chevron.left.forwardslash.chevron.right"
        }
    }
}

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
    var agent: AgentKind?
    var state: SessionState?
    var detail: String?
    var currentAction: String?
    var notificationsMuted: Bool?
    var preview: String?
    var diffStat: DiffStatSummary?
    var context: ContextUsage?

    var id: String { name }
    var resolvedState: SessionState { state ?? .unknown }
    var lastOutputDate: Date { Date(timeIntervalSince1970: lastOutputAt) }
}

struct SessionsResponse: Codable {
    let sessions: [TmuxSession]
}

struct DiffStatSummary: Codable, Hashable {
    let files: Int
    let adds: Int
    let dels: Int
}

/// How full a session's context window is, parsed from the token accounting in
/// its transcript. `limitEstimated` says the window size was inferred rather
/// than proved — transcripts record the model but never its window size.
struct ContextUsage: Codable, Hashable {
    let tokens: Int
    let limit: Int
    var limitEstimated: Bool?
    var model: String?
    var compactions: Int?
    var droppedTokens: Int?

    var fraction: Double {
        guard limit > 0 else { return 0 }
        return min(Double(tokens) / Double(limit), 1)
    }

    var percent: Int { Int((fraction * 100).rounded()) }

    /// Colour thresholds shared by every surface that draws the meter, so a
    /// session reads the same on a fleet card as it does in the inspector.
    var isTight: Bool { fraction >= 0.7 }
    var isCritical: Bool { fraction >= 0.9 }
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
    let pullRequest: PullRequestSummary?

    var resolvedPullRequest: PullRequestSummary? {
        if let pullRequest { return pullRequest }
        guard let prUrl, !prUrl.isEmpty else { return nil }
        return PullRequestSummary(
            url: prUrl,
            number: Int(URL(string: prUrl)?.lastPathComponent ?? "") ?? 0,
            title: "Open pull request",
            headRefName: "",
            state: "OPEN"
        )
    }
}

struct PullRequestSummary: Codable, Identifiable, Hashable {
    let url: String
    let number: Int
    let title: String
    let headRefName: String
    let state: String

    var id: String { url }
}

struct AuthoredPullRequest: Codable, Identifiable, Hashable {
    let url: String
    let number: Int
    let title: String
    let repository: String
    let headRefName: String
    let baseRefName: String
    let isDraft: Bool
    let reviewDecision: String
    let updatedAt: String
    let additions: Int
    let deletions: Int
    let changedFiles: Int
    let checks: [PullRequestCheck]
    let comments: [PullRequestComment]
    var unreadComments: [PullRequestComment]?
    var unreadSince: String?
    let latestCommentAt: String?
    let hasUnreadActivity: Bool
    let workspaceId: String
    let workspaceName: String
    let workspacePath: String
    let worktreePath: String?

    var id: String { url }
    var failedCheckCount: Int { checks.filter { $0.state == "fail" }.count }
    var pendingCheckCount: Int { checks.filter { $0.state == "pending" }.count }
    var passedCheckCount: Int { checks.filter { $0.state == "pass" }.count }
    var resolvedUnreadComments: [PullRequestComment] { unreadComments ?? [] }
}

struct PullRequestCheck: Codable, Identifiable, Hashable {
    let name: String
    let state: String
    var id: String { "\(name)|\(state)" }
}

struct PullRequestComment: Codable, Identifiable, Hashable {
    let author: String
    let body: String
    let createdAt: String?
    var path: String?
    var line: Int?
    var id: String { "\(author)|\(createdAt ?? "")|\(body.prefix(32))" }
}

struct AuthoredPullRequestsResponse: Codable {
    let pullRequests: [AuthoredPullRequest]
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

struct QuickRepliesResponse: Codable {
    let replies: [String]
}

// The structured conversation feed, parsed server-side from the session's Claude
// Code transcript. `available` is false for sessions without a transcript (plain
// shells, or Claude sessions running without the Mission Control hooks).
struct Conversation: Decodable {
    var available: Bool
    var agent: AgentKind?
    var title: String?
    var model: String?
    var todos: [ConversationTodo]
    var entries: [ConversationEntry]
    var state: String?  // working | needs_input | idle | unknown
    var action: String? // live step label while working, e.g. "Reading Foo.swift"
    var context: ContextUsage?
    var pending: [PendingMessage]?
    var info: SessionInfo?
    /// The pane as it stands, sent only when the session is waiting on you and
    /// the transcript can't say why — Claude Code writes an AskUserQuestion
    /// record only once the question is answered, so while the dialog is open
    /// the terminal is the only place the question exists.
    var prompt: String?
    /// The same pane parsed into a question when it reads like a choice, with the
    /// currently highlighted option marked — which is what makes picking a
    /// specific option possible rather than only taking the default.
    var promptQuestion: ConversationQuestion?
}

/// How a session is configured — most of what `/status` and `/model` would
/// print, read out of the transcript instead of by running a command whose
/// output only ever renders inside the TUI.
struct SessionInfo: Decodable {
    var model: String?
    var effort: String?
    var permissionMode: String?
    var mode: String?
    var version: String?
    var gitBranch: String?
    var slug: String?

    /// "claude-opus-5" reads as noise in a one-line panel; "Opus 5" doesn't.
    var shortModel: String? {
        guard let model else { return nil }
        let stripped = model.hasPrefix("claude-") ? String(model.dropFirst("claude-".count)) : model
        var parts = stripped.split(separator: "-").map(String.init)
        // Drop a trailing date stamp: claude-haiku-4-5-20251001 → Haiku 4.5
        if let last = parts.last, last.count == 8, Int(last) != nil { parts.removeLast() }
        guard let family = parts.first else { return model }
        let version = parts.dropFirst().joined(separator: ".")
        return version.isEmpty ? family.capitalized : "\(family.capitalized) \(version)"
    }

    /// Only the modes worth flagging. "auto" is the default everyone runs.
    var notablePermissionMode: String? {
        if mode == "plan" { return "Plan mode" }
        switch permissionMode {
        case "plan": return "Plan mode"
        case "acceptEdits": return "Auto-accepting edits"
        case "bypassPermissions": return "Permissions bypassed"
        default: return nil
        }
    }
}

/// A prompt queued behind the running turn. Claude Code keeps its queue in the
/// TUI and never writes it to disk, so this comes from what the server sent —
/// which also means a message queued on the Mac shows up on the phone.
struct PendingMessage: Decodable, Identifiable {
    let text: String
    let at: TimeInterval

    var id: String { "\(at)-\(text.prefix(32))" }
}

/// A session's live hook state on its own — the cheapest question the server
/// answers, since it's a registry lookup with no tmux or git call behind it.
struct SessionStateResponse: Decodable {
    let state: SessionState
    var agent: AgentKind?
    var detail: String?
    var currentAction: String?
}

/// One decision waiting on you, from any server. Carries enough of the session's
/// tail to decide inside the inbox instead of opening the session.
struct InboxItem: Decodable, Identifiable {
    let session: String
    var detail: String?
    let waitingSince: TimeInterval
    var cwd: String?
    var muted: Bool?
    var pendingTool: PendingTool?
    var question: ConversationQuestion?
    var assistantText: String?
    var diffStat: DiffStatSummary?

    /// Set by the client after decoding: which server this came from, so the
    /// inbox can act on the right one.
    var serverID: String = ""
    var serverName: String = ""
    var serverURL: String = ""
    var serverToken: String = ""

    var id: String { "\(serverID)|\(session)" }
    var waitingSinceDate: Date { Date(timeIntervalSince1970: waitingSince / 1000) }

    struct PendingTool: Decodable {
        var tool: String?
        var verb: String?
        var arg: String?
    }

    private enum CodingKeys: String, CodingKey {
        case session, detail, waitingSince, cwd, muted, pendingTool, question, assistantText, diffStat
    }
}

struct InboxResponse: Decodable {
    let items: [InboxItem]
}

struct ConversationTodo: Decodable {
    let content: String
    let status: String // pending | in_progress | completed
}

struct ConversationDiffLine: Decodable {
    let kind: String // add | del | ctx
    let text: String
}

// One AskUserQuestion prompt shown in the feed. A picked option carries
// `selected`; `answer` holds a free-text ("Other") response that matched no option.
struct ConversationQuestion: Decodable {
    var header: String?
    let question: String
    var multiSelect: Bool?
    var options: [ConversationQuestionOption]
    var answer: String?
    var notes: String?
}

struct ConversationQuestionOption: Decodable, Identifiable {
    let label: String
    var description: String?
    /// The option's worked example — usually the draft being decided on, so
    /// often the only part that actually answers the question.
    var preview: String?
    var selected: Bool?
    var id: String { label }
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
    var questions: [ConversationQuestion]?
}

// CI status for a session's open pull request, from `gh pr checks`.
struct SessionChecks: Decodable {
    var available: Bool
    var checks: [CheckRun]
}

struct CheckRun: Decodable, Identifiable {
    let name: String
    let state: String // pass | fail | pending | skipping | cancel | ...
    let durationSeconds: Int?
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
    var origin: String?
    let worktrees: [GitWorktree]
}

struct PullRequestResult: Decodable {
    let url: String
}

struct ReviewComment: Decodable, Identifiable {
    let author: String
    let body: String
    var state: String?
    var id: String { "\(author)-\(body.prefix(24))" }
}

struct ReviewsResponse: Decodable {
    let comments: [ReviewComment]
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

enum LoopFrequency: String, Codable, CaseIterable, Identifiable {
    case hourly
    case daily
    case weekdays
    case weekly

    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .hourly: return "Every few hours"
        case .daily: return "Every day"
        case .weekdays: return "Weekdays"
        case .weekly: return "Every week"
        }
    }
}

struct LoopSchedule: Codable, Hashable {
    var frequency: LoopFrequency
    var intervalHours: Int?
    var hour: Int?
    var minute: Int?
    var weekday: Int?

    var summary: String {
        switch frequency {
        case .hourly:
            let interval = intervalHours ?? 1
            return interval == 1 ? "Every hour" : "Every \(interval)h"
        case .daily:
            return "Every day · \(clockTime)"
        case .weekdays:
            return "Weekdays · \(clockTime)"
        case .weekly:
            let names = Calendar.current.weekdaySymbols
            let index = min(max(weekday ?? 0, 0), names.count - 1)
            return "\(names[index]) · \(clockTime)"
        }
    }

    private var clockTime: String {
        String(format: "%02d:%02d", hour ?? 0, minute ?? 0)
    }
}

struct MissionLoop: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var workspaceId: String
    var workspaceName: String
    var prompt: String
    var agent: AgentKind
    var schedule: LoopSchedule
    var enabled: Bool
    var runs: Int
    var successfulRuns: Int
    var lastRunAt: TimeInterval?
    var lastDurationMs: TimeInterval?
    var lastError: String?
    var nextRunAt: TimeInterval
    var createdAt: TimeInterval

    var nextRunDate: Date { Date(timeIntervalSince1970: nextRunAt / 1000) }
    var lastRunDate: Date? { lastRunAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
    var successPercent: Int {
        guard runs > 0 else { return 100 }
        return Int((Double(successfulRuns) / Double(runs) * 100).rounded())
    }
}

struct LoopsResponse: Codable {
    let loops: [MissionLoop]
}

struct LoopResponse: Codable {
    let loop: MissionLoop
}

struct LoopRunResponse: Codable {
    let loop: MissionLoop
    let session: String
}

struct ArchivedChat: Decodable, Identifiable {
    let id: String
    let session: String
    let archivedAt: TimeInterval
    let agent: AgentKind
    let cwd: String?
    let conversation: Conversation

    var archivedDate: Date { Date(timeIntervalSince1970: archivedAt / 1000) }
}

struct ArchivesResponse: Decodable {
    let archives: [ArchivedChat]
}

struct ArchiveResponse: Decodable {
    let archive: ArchivedChat
}
