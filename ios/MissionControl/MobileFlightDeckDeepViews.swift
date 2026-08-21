#if !targetEnvironment(macCatalyst)
import SwiftUI

struct MobileWorkspaceDetailView: View {
    let workspace: Workspace
    let sessions: [TmuxSession]
    let api: APIClient?
    let deviceName: String
    let onChanged: () async -> Void
    let onOpenSession: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toasts: ToastCenter
    @State private var dirtyByPath: [String: Bool] = [:]
    @State private var actionWorktree: GitWorktree?
    @State private var launching = false
    @State private var removingWorkspace = false
    @State private var confirmWorkspaceRemoval = false

    private var primaryCheckout: GitWorktree? {
        workspace.worktrees.first(where: \.isMain) ?? workspace.worktrees.first
    }

    private var linkedWorktrees: [GitWorktree] {
        workspace.worktrees.filter { !$0.isMain && $0.id != primaryCheckout?.id }
    }

    var body: some View {
        VStack(spacing: 0) {
            mobileDetailHeader(
                title: workspace.name,
                subtitle: "\(deviceName) · \(workspace.worktrees.count) CHECKOUTS",
                trailing: "•••",
                onBack: { dismiss() },
                onTrailing: { confirmWorkspaceRemoval = true }
            )

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(workspace.name)
                                .font(.mobileDeckSans(24, weight: .bold))
                                .tracking(-0.5)
                            Text("\(workspace.worktrees.count) linked checkout\(workspace.worktrees.count == 1 ? "" : "s") · \(activeAgentCount) live agent\(activeAgentCount == 1 ? "" : "s")")
                                .font(.mobileDeckSans(11))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                        }
                        Spacer()
                        Button { Task { await launch(path: workspace.path) } } label: {
                            Image(systemName: "plus")
                                .font(.mobileDeckSans(18, weight: .bold))
                                .foregroundStyle(MobileFlightDeckPalette.onAccent)
                                .frame(width: 38, height: 38)
                                .background(MobileFlightDeckPalette.amber, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .disabled(launching)
                        .accessibilityLabel("New shell in workspace")
                    }

                    if let primaryCheckout {
                        mobileSectionLabel("PRIMARY CHECKOUT")
                        checkoutCard(primaryCheckout, emphasized: true)
                    }

                    if !linkedWorktrees.isEmpty {
                        mobileSectionLabel("LINKED WORKTREES")
                        VStack(spacing: 0) {
                            ForEach(Array(linkedWorktrees.enumerated()), id: \.element.id) { index, worktree in
                                checkoutRow(worktree)
                                if index < linkedWorktrees.count - 1 {
                                    Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                                }
                            }
                        }
                        .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous).stroke(MobileFlightDeckPalette.border))
                        .clipShape(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                    }

                    if workspace.worktrees.isEmpty {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("No checkouts discovered")
                                .font(.mobileDeckSans(14, weight: .semibold))
                            Text("Launch a shell in the repository to refresh its checkout list.")
                                .font(.mobileDeckSans(12))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .mobileDeckCard(radius: 14)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }

            Button { Task { await launchInWorkspace() } } label: {
                Text(launching ? "Launching…" : "+  New shell in workspace")
                    .font(.mobileDeckSans(12, weight: .bold))
                    .foregroundStyle(MobileFlightDeckPalette.onAccent)
                    .frame(maxWidth: .infinity, minHeight: 42)
                    .background(MobileFlightDeckPalette.amber, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(launching)
            .padding(.horizontal, 16)
            .padding(.top, 9)
            .padding(.bottom, 8)
            .background(MobileFlightDeckPalette.surface)
            .overlay(alignment: .top) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
        .task { await loadDirtyState() }
        .sheet(item: $actionWorktree) { worktree in
            MobileWorktreeActionsSheet(
                workspace: workspace,
                worktree: resolved(worktree),
                activeAgents: activeAgents(in: worktree),
                api: api,
                onLaunch: {
                    actionWorktree = nil
                    Task { await launch(path: worktree.path) }
                },
                onRemoved: {
                    actionWorktree = nil
                    await onChanged()
                    dismiss()
                }
            )
            .presentationDetents([.height(350)])
            .presentationDragIndicator(.hidden)
            .presentationCornerRadius(24)
            .presentationBackground(MobileFlightDeckPalette.surface)
        }
        .confirmationDialog("Remove workspace?", isPresented: $confirmWorkspaceRemoval) {
            Button("Remove \(workspace.name)", role: .destructive) {
                Task { await removeWorkspace() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The repository stays on disk. Remy only forgets this saved workspace.")
        }
    }

    private var activeAgentCount: Int {
        workspace.worktrees.reduce(0) { result, worktree in result + activeAgents(in: worktree) }
    }

    private func activeAgents(in worktree: GitWorktree) -> Int {
        let prefix = worktree.path.hasSuffix("/") ? worktree.path : worktree.path + "/"
        return sessions.filter { $0.panePath == worktree.path || $0.panePath.hasPrefix(prefix) }.count
    }

    private func resolved(_ worktree: GitWorktree) -> GitWorktree {
        GitWorktree(
            path: worktree.path,
            branch: worktree.branch,
            isMain: worktree.isMain,
            dirty: dirtyByPath[worktree.path] ?? worktree.dirty
        )
    }

    private func checkoutCard(_ worktree: GitWorktree, emphasized: Bool) -> some View {
        let item = resolved(worktree)
        return VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("Primary checkout")
                    .font(.mobileDeckSans(14, weight: .bold))
                Spacer()
                checkoutState(item)
            }
            Text(abbreviatedMobilePath(item.path))
                .font(.mobileDeckMono(9))
                .foregroundStyle(MobileFlightDeckPalette.muted)
                .lineLimit(1)
            Button { Task { await launch(path: item.path) } } label: {
                Text("Launch shell here")
                    .font(.mobileDeckSans(11, weight: .semibold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .overlay(RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous).stroke(MobileFlightDeckPalette.amber.opacity(0.45)))
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(emphasized ? MobileFlightDeckPalette.raised : MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous).stroke(emphasized ? MobileFlightDeckPalette.amber.opacity(0.35) : MobileFlightDeckPalette.border))
    }

    private func checkoutRow(_ worktree: GitWorktree) -> some View {
        let item = resolved(worktree)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(item.branch ?? "Detached HEAD")
                    .font(.mobileDeckSans(14, weight: .semibold))
                    .lineLimit(1)
                Spacer()
                checkoutState(item)
            }
            Text(abbreviatedMobilePath(item.path))
                .font(.mobileDeckMono(9))
                .foregroundStyle(MobileFlightDeckPalette.muted)
                .lineLimit(1)
            HStack(spacing: 8) {
                Button { Task { await launch(path: item.path) } } label: {
                    Text("Shell here")
                        .font(.mobileDeckSans(10, weight: .semibold))
                        .foregroundStyle(MobileFlightDeckPalette.amber)
                        .padding(.horizontal, 12)
                        .frame(height: 34)
                        .overlay(RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous).stroke(MobileFlightDeckPalette.amber.opacity(0.45)))
                }
                .buttonStyle(.plain)
                Button { actionWorktree = item } label: {
                    Text("•••")
                        .font(.mobileDeckSans(13, weight: .bold))
                        .foregroundStyle(item.dirty ? MobileFlightDeckPalette.red : MobileFlightDeckPalette.secondary)
                        .frame(width: 38, height: 34)
                        .overlay(RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous).stroke(item.dirty ? MobileFlightDeckPalette.red : MobileFlightDeckPalette.border))
                }
                .buttonStyle(.plain)
                Spacer()
                Text("\(activeAgents(in: item)) active")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(MobileFlightDeckPalette.muted)
            }
        }
        .padding(14)
    }

    private func checkoutState(_ worktree: GitWorktree) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(worktree.dirty ? MobileFlightDeckPalette.red : MobileFlightDeckPalette.green)
                .frame(width: 6, height: 6)
            Text(worktree.dirty ? "DIRTY" : "CLEAN")
        }
        .font(.mobileDeckMono(9))
        .foregroundStyle(worktree.dirty ? MobileFlightDeckPalette.red : MobileFlightDeckPalette.green)
    }

    private func loadDirtyState() async {
        dirtyByPath = (try? await api?.worktreeDirty(workspaceID: workspace.id)) ?? [:]
    }

    private func launch(path: String) async {
        guard let api, !launching else { return }
        launching = true
        defer { launching = false }
        do {
            let session = try await api.createSession(name: nil, path: path, agent: .shell)
            guard !session.isEmpty else { return }
            toasts.show(.success, "Shell launched")
            onOpenSession(session)
        } catch {
            toasts.show(.error, "Couldn't launch shell: \(error.localizedDescription)")
        }
    }

    private func launchInWorkspace() async {
        guard let api, !launching else { return }
        launching = true
        defer { launching = false }
        do {
            let session = try await api.openSessionInWorkspace(id: workspace.id)
            guard !session.isEmpty else { return }
            toasts.show(.success, "Shell launched")
            onOpenSession(session)
        } catch {
            toasts.show(.error, "Couldn't launch workspace shell")
        }
    }

    private func removeWorkspace() async {
        guard let api, !removingWorkspace else { return }
        removingWorkspace = true
        defer { removingWorkspace = false }
        do {
            try await api.removeWorkspace(id: workspace.id)
            await onChanged()
            toasts.show(.success, "Removed \(workspace.name)")
            dismiss()
        } catch {
            toasts.show(.error, "Couldn't remove workspace")
        }
    }
}

private struct MobileWorktreeActionsSheet: View {
    let workspace: Workspace
    let worktree: GitWorktree
    let activeAgents: Int
    let api: APIClient?
    let onLaunch: () -> Void
    let onRemoved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toasts: ToastCenter
    @State private var removing = false
    @State private var confirmForceRemoval = false

    var body: some View {
        VStack(spacing: 9) {
            Capsule()
                .fill(MobileFlightDeckPalette.strongBorder)
                .frame(width: 38, height: 5)

            VStack(alignment: .leading, spacing: 5) {
                Text(worktree.branch ?? "Linked worktree")
                    .font(.mobileDeckSans(19, weight: .bold))
                Text("\(worktree.dirty ? "DIRTY" : "CLEAN") · \(activeAgents) ACTIVE AGENT\(activeAgents == 1 ? "" : "S")")
                    .font(.mobileDeckMono(9))
                    .foregroundStyle(worktree.dirty ? MobileFlightDeckPalette.red : MobileFlightDeckPalette.green)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)

            actionButton("Launch shell here", primary: true, color: MobileFlightDeckPalette.amber, action: onLaunch)
            actionButton("Remove worktree", primary: false, color: MobileFlightDeckPalette.secondary) {
                Task { await remove(force: false) }
            }
            actionButton("Force clean & remove", primary: false, color: MobileFlightDeckPalette.red) {
                confirmForceRemoval = true
            }
            Text("Force clean stops agents and discards uncommitted files. The branch is preserved.")
                .font(.mobileDeckSans(10))
                .foregroundStyle(MobileFlightDeckPalette.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
                .padding(.vertical, 4)
            actionButton("Cancel", primary: false, color: MobileFlightDeckPalette.text) { dismiss() }
        }
        .padding(.horizontal, 18)
        .padding(.top, 9)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.surface)
        .confirmationDialog("Discard changes and remove?", isPresented: $confirmForceRemoval) {
            Button("Force clean & remove", role: .destructive) {
                Task { await remove(force: true) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This stops active agents and permanently discards uncommitted files in this worktree.")
        }
    }

    private func actionButton(_ title: String, primary: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(removing ? "Working…" : title)
                .font(.mobileDeckSans(14, weight: primary ? .bold : .semibold))
                .foregroundStyle(primary ? MobileFlightDeckPalette.onAccent : color)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(primary ? color : Color.clear, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous).stroke(primary ? Color.clear : color == MobileFlightDeckPalette.text ? MobileFlightDeckPalette.background : color))
        }
        .buttonStyle(.plain)
        .disabled(removing)
    }

    private func remove(force: Bool) async {
        guard let api, !removing else { return }
        removing = true
        defer { removing = false }
        do {
            let result = try await api.closeWorktree(workspaceID: workspace.id, path: worktree.path, force: force)
            toasts.show(.success, "Removed worktree and stopped \(result.killedSessions.count) session\(result.killedSessions.count == 1 ? "" : "s")")
            await onRemoved()
        } catch {
            toasts.show(.error, "Couldn't remove worktree: \(error.localizedDescription)")
        }
    }
}

struct MobileAddWorkspaceView: View {
    let sessions: [TmuxSession]
    let workspaces: [Workspace]
    let api: APIClient?
    let deviceName: String
    let onSaved: () async -> Void
    let onOpenSession: (String) -> Void

    private enum Source: String, CaseIterable, Identifiable {
        case shell = "From shell"
        case browse = "Browse device"
        var id: String { rawValue }
    }

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toasts: ToastCenter
    @State private var source: Source = .shell
    @State private var name = ""
    @State private var path = ""
    @State private var savingSession: String?
    @State private var launching = false

    private var activeShells: [TmuxSession] {
        sessions.filter { !$0.panePath.isEmpty }
    }

    var body: some View {
        VStack(spacing: 0) {
            mobileDetailHeader(
                title: "Add Workspace",
                subtitle: source == .shell ? "FROM ACTIVE SHELL" : "BROWSE DEVICE",
                trailing: "•••",
                onBack: { dismiss() },
                onTrailing: {}
            )
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    mobileSegmentedControl(selection: $source, values: Source.allCases)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(source == .shell ? "Save the directory you’re in" : "Save a repository path")
                            .font(.mobileDeckSans(18, weight: .bold))
                        Text(source == .shell
                            ? "Launch a shell, cd to any Git repository, then save its current directory as a workspace."
                            : "Enter the absolute path to a Git repository on this device.")
                            .font(.mobileDeckSans(12))
                            .foregroundStyle(MobileFlightDeckPalette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                    .background(MobileFlightDeckPalette.raised, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous).stroke(MobileFlightDeckPalette.amber.opacity(0.35)))

                    if source == .shell {
                        HStack {
                            Text("Active shells")
                                .font(.mobileDeckSans(15, weight: .bold))
                            Spacer()
                            Text(deviceName)
                                .font(.mobileDeckSans(11))
                                .foregroundStyle(MobileFlightDeckPalette.muted)
                        }
                        if activeShells.isEmpty {
                            Text("No active shells on this device.")
                                .font(.mobileDeckSans(12))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .mobileDeckCard(radius: 14)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(activeShells.enumerated()), id: \.element.id) { index, session in
                                    shellRow(session)
                                    if index < activeShells.count - 1 {
                                        Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                                    }
                                }
                            }
                            .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous).stroke(MobileFlightDeckPalette.border))
                            .clipShape(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                        }
                    } else {
                        VStack(spacing: 12) {
                            mobileTextField("Workspace name", text: $name)
                            mobileTextField("Absolute repository path", text: $path, monospaced: true)
                            Button { Task { await saveManualWorkspace() } } label: {
                                Text("Save workspace")
                                    .font(.mobileDeckSans(12, weight: .bold))
                                    .foregroundStyle(MobileFlightDeckPalette.onAccent)
                                    .frame(maxWidth: .infinity, minHeight: 40)
                                    .background(MobileFlightDeckPalette.amber, in: RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || path.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        .padding(14)
                        .mobileDeckCard(radius: 16)
                    }

                    Text("Only Git repositories can be saved. Existing linked worktrees are discovered automatically.")
                        .font(.mobileDeckSans(10))
                        .foregroundStyle(MobileFlightDeckPalette.muted)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            Button { Task { await launchShell() } } label: {
                Text(launching ? "Launching…" : "+  Launch a new shell")
                    .font(.mobileDeckSans(12, weight: .bold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
                    .frame(maxWidth: .infinity, minHeight: 42)
                    .overlay(RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous).stroke(MobileFlightDeckPalette.amber.opacity(0.45)))
            }
            .buttonStyle(.plain)
            .disabled(launching)
            .padding(.horizontal, 16)
            .padding(.top, 9)
            .padding(.bottom, 8)
            .background(MobileFlightDeckPalette.surface)
            .overlay(alignment: .top) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
    }

    private func shellRow(_ session: TmuxSession) -> some View {
        let alreadySaved = workspaces.contains { workspace in
            session.panePath == workspace.path || workspace.worktrees.contains { $0.path == session.panePath }
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(session.name)
                    .font(.mobileDeckSans(14, weight: .semibold))
                Spacer()
                Text("Connected")
                    .font(.mobileDeckMono(9))
                    .foregroundStyle(MobileFlightDeckPalette.green)
            }
            Text(abbreviatedMobilePath(session.panePath))
                .font(.mobileDeckMono(10))
                .foregroundStyle(MobileFlightDeckPalette.secondary)
                .lineLimit(1)
            Button { Task { await save(session) } } label: {
                Text(alreadySaved ? "Already saved" : savingSession == session.name ? "Saving…" : "Save as workspace")
                    .font(.mobileDeckSans(11, weight: .bold))
                    .foregroundStyle(alreadySaved ? MobileFlightDeckPalette.muted : MobileFlightDeckPalette.onAccent)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .background(alreadySaved ? Color.clear : MobileFlightDeckPalette.amber, in: RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous).stroke(alreadySaved ? MobileFlightDeckPalette.border : Color.clear))
            }
            .buttonStyle(.plain)
            .disabled(alreadySaved || savingSession != nil)
        }
        .padding(14)
    }

    private func save(_ session: TmuxSession) async {
        guard let api, savingSession == nil else { return }
        savingSession = session.name
        defer { savingSession = nil }
        let repositoryName = URL(fileURLWithPath: session.panePath).lastPathComponent
        do {
            try await api.saveWorkspace(fromSession: session.name, name: repositoryName, path: session.panePath)
            await onSaved()
            toasts.show(.success, "Saved \(repositoryName)")
            dismiss()
        } catch {
            toasts.show(.error, error.localizedDescription)
        }
    }

    private func saveManualWorkspace() async {
        guard let api else { return }
        do {
            try await api.addWorkspace(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                path: path.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            await onSaved()
            toasts.show(.success, "Saved \(name)")
            dismiss()
        } catch {
            toasts.show(.error, error.localizedDescription)
        }
    }

    private func launchShell() async {
        guard let api, !launching else { return }
        launching = true
        defer { launching = false }
        do {
            let session = try await api.createSession(name: nil, path: nil, agent: .shell)
            guard !session.isEmpty else { return }
            onOpenSession(session)
        } catch {
            toasts.show(.error, "Couldn't launch shell")
        }
    }
}

struct MobileSessionStatusView: View {
    let sessionName: String
    let api: APIClient?
    let initialState: SessionState?
    let initialAgent: AgentKind?
    let onArchive: () -> Void
    let onOpenTerminal: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var session: TmuxSession?
    @State private var checks: [CheckRun] = []
    @State private var conversation: Conversation?
    @State private var loading = true

    private var contextPercent: Int { session?.context?.percent ?? conversation?.context?.percent ?? 0 }
    private var resolvedState: SessionState { session?.resolvedState ?? initialState ?? .unknown }
    private var resolvedAgent: AgentKind { session?.agent ?? initialAgent ?? .shell }

    var body: some View {
        VStack(spacing: 0) {
            mobileDetailHeader(
                title: "Session Status",
                subtitle: "\(sessionName) · LIVE",
                trailing: "•••",
                onBack: { dismiss() },
                onTrailing: {}
            )
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(healthTitle)
                                .font(.mobileDeckSans(22, weight: .bold))
                            Text(healthSubtitle)
                                .font(.mobileDeckSans(11))
                                .foregroundStyle(healthColor)
                        }
                        Spacer()
                        ZStack {
                            Circle()
                                .stroke(MobileFlightDeckPalette.border, lineWidth: 4)
                            Circle()
                                .trim(from: 0, to: max(CGFloat(contextPercent) / 100, 0.03))
                                .stroke(MobileFlightDeckPalette.amber, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                            Text("\(contextPercent)%")
                                .font(.mobileDeckSans(17, weight: .bold))
                        }
                        .frame(width: 58, height: 58)
                    }

                    VStack(spacing: 0) {
                        statusRow("Agent", "\(resolvedAgent.displayName) · \(conversation?.model ?? session?.context?.model ?? "Live")")
                        Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                        statusRow("WORKTREE", session?.panePath.isEmpty == false ? URL(fileURLWithPath: session?.panePath ?? "").lastPathComponent : "Home")
                        Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                        statusRow("TURN", "\(relativeMobileTime(session?.lastOutputAt ?? Date().timeIntervalSince1970)) · \(stateLabel)")
                    }
                    .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous).stroke(MobileFlightDeckPalette.border))
                    .clipShape(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))

                    HStack {
                        Text("Checks")
                            .font(.mobileDeckSans(15, weight: .bold))
                        Spacer()
                        Text(checks.isEmpty ? (loading ? "Loading" : "No checks") : "\(checks.filter { $0.state == "pass" }.count) of \(checks.count) passed")
                            .font(.mobileDeckSans(11))
                            .foregroundStyle(MobileFlightDeckPalette.muted)
                    }

                    VStack(spacing: 0) {
                        if checks.isEmpty {
                            Text(loading ? "Fetching session checks…" : "No pull-request checks are attached to this session.")
                                .font(.mobileDeckSans(12))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                                .padding(13)
                                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                        } else {
                            ForEach(Array(checks.enumerated()), id: \.element.id) { index, check in
                                checkRow(check)
                                if index < checks.count - 1 {
                                    Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                                }
                            }
                        }
                    }
                    .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous).stroke(MobileFlightDeckPalette.border))
                    .clipShape(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            HStack(spacing: 8) {
                Button {
                    dismiss()
                    onArchive()
                } label: {
                    Text("Archive chat")
                        .font(.mobileDeckSans(12))
                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .overlay(RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous).stroke(MobileFlightDeckPalette.border))
                }
                .buttonStyle(.plain)
                .disabled(resolvedAgent == .shell)
                Button {
                    dismiss()
                    onOpenTerminal()
                } label: {
                    Text("Open terminal")
                        .font(.mobileDeckSans(12, weight: .bold))
                        .foregroundStyle(MobileFlightDeckPalette.onAccent)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(MobileFlightDeckPalette.amber, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 9)
            .padding(.bottom, 8)
            .background(MobileFlightDeckPalette.surface)
            .overlay(alignment: .top) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
        .task { await load() }
    }

    private var healthTitle: String {
        switch resolvedState {
        case .needsInput: return "Decision required"
        case .unknown: return "Session connecting"
        default: return "Session healthy"
        }
    }

    private var healthSubtitle: String {
        switch resolvedState {
        case .needsInput: return "Waiting for your command"
        case .working: return "Agent is in flight"
        case .idle: return "All systems nominal"
        case .unknown: return "Awaiting live status"
        }
    }

    private var healthColor: Color {
        resolvedState == .needsInput ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.green
    }

    private var stateLabel: String {
        switch resolvedState {
        case .working: return "Healthy"
        case .needsInput: return "Needs input"
        case .idle: return "Standing by"
        case .unknown: return "Connecting"
        }
    }

    private func statusRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.mobileDeckMono(9))
                .foregroundStyle(MobileFlightDeckPalette.muted)
                .frame(width: 92, alignment: .leading)
            Text(value)
                .font(.mobileDeckSans(12))
                .lineLimit(1)
        }
        .padding(.horizontal, 13)
        .frame(height: 47)
    }

    private func checkRow(_ check: CheckRun) -> some View {
        let passed = check.state == "pass"
        let pending = ["pending", "queued", "in_progress"].contains(check.state)
        let color = passed ? MobileFlightDeckPalette.green : pending ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.red
        return HStack {
            Text(passed ? "✓" : pending ? "!" : "×")
                .font(.mobileDeckSans(16))
                .foregroundStyle(color)
                .frame(width: 24, alignment: .leading)
            Text(check.name)
                .font(.mobileDeckSans(12))
                .lineLimit(1)
            Spacer()
            Text(check.durationSeconds.map { "\($0)s" } ?? check.state)
                .font(.mobileDeckMono(9))
                .foregroundStyle(pending ? color : MobileFlightDeckPalette.muted)
        }
        .padding(.horizontal, 13)
        .frame(height: 42)
    }

    private func load() async {
        async let sessionsCall = api?.sessions()
        async let checksCall = api?.checks(sessionName)
        async let conversationCall = api?.conversation(sessionName, limit: 1)
        session = (try? await sessionsCall)?.first { $0.name == sessionName }
        checks = (try? await checksCall)?.checks ?? []
        conversation = try? await conversationCall
        loading = false
    }
}

private func mobileSectionLabel(_ title: String) -> some View {
    Text(title)
        .font(.mobileDeckMono(9))
        .foregroundStyle(MobileFlightDeckPalette.muted)
        .padding(.top, 4)
}

private func abbreviatedMobilePath(_ path: String) -> String {
    guard path.count > 42 else { return path.replacingOccurrences(of: NSHomeDirectory(), with: "~") }
    let components = path.split(separator: "/")
    return "…/" + components.suffix(3).joined(separator: "/")
}

private func mobileTextField(_ placeholder: String, text: Binding<String>, monospaced: Bool = false) -> some View {
    TextField(placeholder, text: text)
        .font(monospaced ? .mobileDeckMono(11) : .mobileDeckSans(12))
        .foregroundStyle(MobileFlightDeckPalette.text)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(.horizontal, 12)
        .frame(height: 42)
        .background(MobileFlightDeckPalette.background, in: RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous).stroke(MobileFlightDeckPalette.border))
}

private func mobileSegmentedControl<Value: Hashable & RawRepresentable & Identifiable>(
    selection: Binding<Value>,
    values: [Value]
) -> some View where Value.RawValue == String {
    HStack(spacing: 0) {
        ForEach(values) { value in
            Button { selection.wrappedValue = value } label: {
                Text(value.rawValue)
                    .font(.mobileDeckSans(11, weight: selection.wrappedValue == value ? .bold : .regular))
                    .foregroundStyle(selection.wrappedValue == value ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.secondary)
                    .frame(maxWidth: .infinity, minHeight: 32)
                    .background(selection.wrappedValue == value ? MobileFlightDeckPalette.raised : Color.clear, in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
    .padding(4)
    .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous).stroke(MobileFlightDeckPalette.border))
}
#endif
