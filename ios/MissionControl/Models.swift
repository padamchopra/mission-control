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
