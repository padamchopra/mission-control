import SwiftUI

/// Shared navigation intent set by push taps / deep links and observed by the
/// session list, which pushes the requested session.
final class AppRouter: ObservableObject {
    enum HistoryAction: Equatable {
        case back
        case forward
    }

    struct HistoryRequest: Equatable {
        let id = UUID()
        let action: HistoryAction
    }

    struct SessionDeletion: Equatable {
        let id = UUID()
        let name: String
        let worktree: WorktreeInfo?
    }

    static let shared = AppRouter()
    @Published var openSession: String?
    @Published private(set) var historyRequest: HistoryRequest?
    @Published var isCommandPalettePresented = false
    @Published private(set) var sessionDeletion: SessionDeletion?
    @Published var terminalSearchSession: String?
    /// A view-level request because Catalyst's split-view visibility belongs to
    /// SessionListView, while the menu bar remains app-scoped.
    @Published private(set) var sidebarToggleRequest = UUID()

    func goBack() {
        historyRequest = HistoryRequest(action: .back)
    }

    func goForward() {
        historyRequest = HistoryRequest(action: .forward)
    }

    func showCommandPalette() {
        isCommandPalettePresented = true
    }

    func toggleSidebar() {
        sidebarToggleRequest = UUID()
    }

    func sessionDidDelete(_ name: String, worktree: WorktreeInfo? = nil) {
        sessionDeletion = SessionDeletion(name: name, worktree: worktree)
    }

    func clearSessionDeletion() {
        sessionDeletion = nil
    }

    func showTerminalSearch(in session: String) {
        terminalSearchSession = session
    }
}
