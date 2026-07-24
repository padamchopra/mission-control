import SwiftUI

/// Repository-first workspace management. Sessions stay in the sidebar while
/// Git structure gets a dedicated, legible surface with deliberate destructive
/// actions instead of hiding worktree removal inside a session menu.
struct WorkspaceRepositorySheet: View {
    let workspace: Workspace
    let sessions: [TmuxSession]
    let api: APIClient?
    let onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toasts: ToastCenter
    @State private var worktrees: [GitWorktree]
    @State private var pendingWorktree: GitWorktree?
    @State private var showCloseAll = false
    @State private var isClosing = false

    init(
        workspace: Workspace,
        sessions: [TmuxSession],
        api: APIClient?,
        onChanged: @escaping () async -> Void
    ) {
        self.workspace = workspace
        self.sessions = sessions
        self.api = api
        self.onChanged = onChanged
        _worktrees = State(initialValue: workspace.worktrees)
    }

    private var linkedWorktrees: [GitWorktree] {
        worktrees.filter { !$0.isMain }
    }

    private var hasDirtyLinkedWorktree: Bool {
        linkedWorktrees.contains { $0.dirty }
    }

    var body: some View {
        NavigationStack {
            List {
                overview
                worktreeList
                if !linkedWorktrees.isEmpty {
                    bulkActions
                }
            }
            .navigationTitle(workspace.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                "Close worktree?",
                isPresented: worktreeClosePresented,
                presenting: pendingWorktree
            ) { worktree in
                Button("Close cleanly") {
                    Task { await close([worktree], force: false) }
                }
                .disabled(worktree.dirty || isClosing)
                Button("Force close", role: .destructive) {
                    Task { await close([worktree], force: true) }
                }
                .disabled(isClosing)
            } message: { worktree in
                Text(closeMessage(for: [worktree], all: false))
            }
            .confirmationDialog("Close all linked worktrees?", isPresented: $showCloseAll) {
                Button("Close all cleanly") {
                    Task { await close(linkedWorktrees, force: false) }
                }
                .disabled(hasDirtyLinkedWorktree || isClosing)
                Button("Force close all", role: .destructive) {
                    Task { await close(linkedWorktrees, force: true) }
                }
                .disabled(isClosing)
            } message: {
                Text(closeMessage(for: linkedWorktrees, all: true))
            }
        }
    }

    private var overview: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label("Git repository", systemImage: "folder.badge.gearshape")
                    .font(.headline)
                if let origin = workspace.origin, !origin.isEmpty {
                    Text(origin)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                Text("Primary checkout")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Text(workspace.path)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                Text("\(linkedWorktrees.count) linked \(linkedWorktrees.count == 1 ? "worktree" : "worktrees")")
                    .font(.subheadline)
            }
            .padding(.vertical, 5)
        }
    }

    private var worktreeList: some View {
        Section("Checkouts") {
            ForEach(worktrees) { worktree in
                worktreeRow(worktree)
            }
        }
    }

    private func worktreeRow(_ worktree: GitWorktree) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: worktree.isMain ? "house" : "arrow.triangle.branch")
                .foregroundStyle(worktree.isMain ? Color.accentColor : Color.secondary)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(worktree.isMain ? "Primary checkout" : (worktree.branch ?? "Detached HEAD"))
                        .font(.body.weight(.semibold))
                    if worktree.dirty {
                        Text("Changes")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.orange)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.orange.opacity(0.15), in: Capsule())
                    }
                }
                Text(worktree.path)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                let sessionCount = sessionsIn(worktree).count
                if sessionCount > 0 {
                    Label("\(sessionCount) active \(sessionCount == 1 ? "session" : "sessions")", systemImage: "terminal")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if !worktree.isMain && !worktree.dirty {
                    Label("Safe to reclaim", systemImage: "sparkles")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
            Spacer(minLength: 8)
            if !worktree.isMain {
                Button("Close", role: .destructive) {
                    pendingWorktree = worktree
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .disabled(isClosing)
            }
        }
        .padding(.vertical, 4)
    }

    private var bulkActions: some View {
        Section {
            Button(role: .destructive) {
                showCloseAll = true
            } label: {
                HStack {
                    Label("Close all linked worktrees", systemImage: "trash")
                    Spacer()
                    if isClosing { ProgressView().controlSize(.small) }
                }
            }
            .disabled(isClosing)
        } header: {
            Text("Bulk actions")
        } footer: {
            Text("Clean close refuses uncommitted changes. Force close discards them. Both options stop sessions running inside the affected worktrees; branches are kept.")
        }
    }

    private var worktreeClosePresented: Binding<Bool> {
        Binding(get: { pendingWorktree != nil }, set: { if !$0 { pendingWorktree = nil } })
    }

    private func sessionsIn(_ worktree: GitWorktree) -> [TmuxSession] {
        sessions.filter { $0.panePath == worktree.path || $0.panePath.hasPrefix(worktree.path + "/") }
    }

    private func closeMessage(for targets: [GitWorktree], all: Bool) -> String {
        let sessionCount = targets.flatMap(sessionsIn).count
        var message = all
            ? "This will close \(targets.count) linked worktrees."
            : "This will close \(targets.first?.branch ?? "this") worktree."
        if sessionCount > 0 {
            message += " It will stop \(sessionCount) tmux \(sessionCount == 1 ? "session" : "sessions") running there."
        }
        if targets.contains(where: \.dirty) {
            message += " Clean close is unavailable because there are uncommitted changes. Force close discards them."
        } else {
            message += " Clean close preserves all committed work; the branch is kept."
        }
        return message
    }

    private func close(_ targets: [GitWorktree], force: Bool) async {
        guard let api, !targets.isEmpty else { return }
        isClosing = true
        defer { isClosing = false }
        do {
            let result: WorktreeCloseResult
            if targets.count == linkedWorktrees.count && targets.count > 1 {
                result = try await api.closeAllWorktrees(workspaceID: workspace.id, force: force)
            } else if let target = targets.first {
                result = try await api.closeWorktree(workspaceID: workspace.id, path: target.path, force: force)
            } else {
                return
            }
            worktrees.removeAll { result.closedPaths.contains($0.path) }
            await onChanged()
            let sessions = result.killedSessions.count
            let suffix = sessions == 0 ? "" : " and stopped \(sessions) session\(sessions == 1 ? "" : "s")"
            toasts.show(.success, "Closed \(result.closedPaths.count) worktree\(result.closedPaths.count == 1 ? "" : "s")\(suffix)")
        } catch {
            toasts.show(.error, force ? "Couldn't force-close the worktree" : "Couldn't close cleanly; check for changes")
        }
    }
}
