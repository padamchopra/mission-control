#if !targetEnvironment(macCatalyst)
import SwiftUI

enum MobileFlightDeckPalette {
    static let background = Color(red: 11 / 255, green: 13 / 255, blue: 14 / 255)
    static let surface = Color(red: 21 / 255, green: 25 / 255, blue: 27 / 255)
    static let raised = Color(red: 32 / 255, green: 35 / 255, blue: 29 / 255)
    static let terminal = Color(red: 5 / 255, green: 7 / 255, blue: 6 / 255)
    static let border = Color(red: 52 / 255, green: 59 / 255, blue: 64 / 255)
    static let strongBorder = Color(red: 76 / 255, green: 86 / 255, blue: 91 / 255)
    static let accentBorder = Color(red: 90 / 255, green: 74 / 255, blue: 40 / 255)
    static let text = Color(red: 243 / 255, green: 239 / 255, blue: 228 / 255)
    static let secondary = Color(red: 143 / 255, green: 152 / 255, blue: 147 / 255)
    static let muted = Color(red: 96 / 255, green: 106 / 255, blue: 101 / 255)
    static let warm = Color(red: 192 / 255, green: 183 / 255, blue: 157 / 255)
    static let amber = Color(red: 255 / 255, green: 176 / 255, blue: 32 / 255)
    static let green = Color(red: 86 / 255, green: 197 / 255, blue: 138 / 255)
    static let red = Color(red: 217 / 255, green: 92 / 255, blue: 92 / 255)
    static let onAccent = Color(red: 20 / 255, green: 17 / 255, blue: 10 / 255)
}

extension Font {
    static func mobileDeckSans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    static func mobileDeckMono(_ size: CGFloat, weight: Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

private enum MobileDeckTab: String, CaseIterable, Identifiable {
    case command
    case inbox
    case workspaces
    case loops

    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .command: return "slider.horizontal.3"
        case .inbox: return "tray"
        case .workspaces: return "folder"
        case .loops: return "arrow.trianglehead.2.clockwise.rotate.90"
        }
    }
}

struct MobileFlightDeckView: View {
    let sessions: [TmuxSession]
    let workspaces: [Workspace]
    let loadError: String?
    let hasLoaded: Bool
    let onRefresh: () async -> Void
    let onOpenSession: (String) -> Void
    let onShowConnections: () -> Void

    @ObservedObject private var servers = ServerStore.shared
    @ObservedObject private var inbox = InboxStore.shared
    @EnvironmentObject private var router: AppRouter

    @State private var selectedTab: MobileDeckTab = .command
    @State private var showCommandMenu = false
    @State private var showDeviceSelector = false
    @State private var showPullRequests = false
    @State private var showArchives = false
    @State private var showConnections = false
    @State private var showDeviceDoctor = false
    @State private var showAddWorkspace = false
    @State private var selectedWorkspace: Workspace?
    @State private var selectedLoop: MissionLoop?
    @State private var loops: [MissionLoop] = []
    @State private var archives: [ArchivedChat] = []
    @State private var pullRequests: [AuthoredPullRequest] = []
    @State private var supplementaryLoading = false

    private var activeAPI: APIClient? {
        guard let server = servers.active else { return nil }
        return APIClient(urlString: server.url, token: server.token)
    }

    private var deviceSelectorHeight: CGFloat {
        let visibleDevices = min(servers.servers.count, 3)
        return 211 + CGFloat(visibleDevices) * 59
    }

    private var needsInputSessions: [TmuxSession] {
        sessions.filter { $0.resolvedState == .needsInput }
    }

    private var liveSessions: [TmuxSession] {
        sessions.filter { $0.resolvedState == .working }
    }

    private var archivedCount: Int { archives.count }

    var body: some View {
        VStack(spacing: 0) {
            header
            currentTab
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            tabBar
        }
        .ignoresSafeArea(.container, edges: .bottom)
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .preferredColorScheme(.dark)
        .task(id: servers.activeID) { await loadSupplementaryData(refresh: false) }
        .onReceive(PushChannel.shared.sessionListChanges) { _ in
            Task { await loadSupplementaryData(refresh: false) }
        }
        .sheet(isPresented: $showCommandMenu) {
            MobileCommandMenu(
                archivedCount: archivedCount,
                onQuickOpen: {
                    showCommandMenu = false
                    router.showCommandPalette()
                },
                onPullRequests: {
                    showCommandMenu = false
                    showPullRequests = true
                },
                onArchives: {
                    showCommandMenu = false
                    showArchives = true
                },
                onConnections: {
                    showCommandMenu = false
                    showConnections = true
                },
                onDoctor: {
                    showCommandMenu = false
                    showDeviceDoctor = true
                }
            )
            .presentationDetents([.height(420)])
            .presentationDragIndicator(.hidden)
            .presentationCornerRadius(24)
            .presentationBackground(MobileFlightDeckPalette.surface)
        }
        .sheet(isPresented: $showDeviceSelector) {
            MobileDeviceSelector(onAddConnection: {
                showDeviceSelector = false
                onShowConnections()
            })
            .presentationDetents([.height(deviceSelectorHeight)])
            .presentationDragIndicator(.hidden)
            .presentationCornerRadius(24)
            .presentationBackground(MobileFlightDeckPalette.surface)
        }
        .fullScreenCover(isPresented: $showPullRequests) {
            NavigationStack {
                MobilePullRequestsView(
                    pullRequests: $pullRequests,
                    sessions: sessions,
                    api: activeAPI,
                    onRefresh: { await loadSupplementaryData(refresh: true) },
                    onOpenSession: { session in
                        showPullRequests = false
                        onOpenSession(session)
                    },
                    onClose: { showPullRequests = false }
                )
            }
            .preferredColorScheme(.dark)
        }
        .fullScreenCover(isPresented: $showArchives) {
            MobileArchivesView(archives: archives, onClose: { showArchives = false })
                .preferredColorScheme(.dark)
        }
        .fullScreenCover(isPresented: $showConnections) {
            MobileConnectionsView(
                onAddConnection: {
                    showConnections = false
                    onShowConnections()
                },
                onOpenDoctor: {
                    showConnections = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        showDeviceDoctor = true
                    }
                },
                onClose: { showConnections = false }
            )
            .preferredColorScheme(.dark)
        }
        .fullScreenCover(isPresented: $showDeviceDoctor) {
            MobileDeviceDoctorView(server: servers.active, sessions: sessions, workspaces: workspaces, onClose: { showDeviceDoctor = false })
                .preferredColorScheme(.dark)
        }
        .fullScreenCover(item: $selectedWorkspace) { workspace in
            MobileWorkspaceDetailView(
                workspace: workspace,
                sessions: sessions,
                api: activeAPI,
                deviceName: servers.active?.name ?? "Device",
                onChanged: { await onRefresh() },
                onOpenSession: { session in
                    selectedWorkspace = nil
                    onOpenSession(session)
                }
            )
            .preferredColorScheme(.dark)
        }
        .fullScreenCover(isPresented: $showAddWorkspace) {
            MobileAddWorkspaceView(
                sessions: sessions,
                workspaces: workspaces,
                api: activeAPI,
                deviceName: servers.active?.name ?? "Device",
                onSaved: { await onRefresh() },
                onOpenSession: { session in
                    showAddWorkspace = false
                    onOpenSession(session)
                }
            )
            .preferredColorScheme(.dark)
        }
        .fullScreenCover(item: $selectedLoop) { loop in
            MobileLoopDetailView(
                loop: loop,
                workspaces: workspaces,
                api: activeAPI,
                deviceName: servers.active?.name ?? "Device",
                onUpdated: { updated in
                    if let index = loops.firstIndex(where: { $0.id == updated.id }) {
                        loops[index] = updated
                    }
                    selectedLoop = updated
                },
                onDeleted: {
                    loops.removeAll { $0.id == loop.id }
                    selectedLoop = nil
                },
                onOpenSession: { session in
                    selectedLoop = nil
                    onOpenSession(session)
                }
            )
            .preferredColorScheme(.dark)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 12) {
                deviceMenu
                Spacer()
                Button { showCommandMenu = true } label: {
                    Image(systemName: "ellipsis")
                        .font(.mobileDeckSans(17, weight: .bold))
                        .foregroundStyle(MobileFlightDeckPalette.amber)
                        .frame(width: 38, height: 38)
                        .background(MobileFlightDeckPalette.surface, in: Circle())
                        .overlay(Circle().stroke(MobileFlightDeckPalette.border))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Mission Control menu")
            }

            Text(selectedTab == .command ? "Command Center" : selectedTab.title)
                .font(.mobileDeckSans(28, weight: .bold))
                .tracking(-0.7)

            if selectedTab == .command {
                fleetStrip
            } else if selectedTab == .inbox {
                Text("\(inbox.count) decision\(inbox.count == 1 ? "" : "s") need your attention")
                    .font(.mobileDeckSans(13))
                    .foregroundStyle(MobileFlightDeckPalette.secondary)
            } else if selectedTab == .workspaces {
                Text("\(workspaces.count) repositories across this device")
                    .font(.mobileDeckSans(13))
                    .foregroundStyle(MobileFlightDeckPalette.secondary)
            } else {
                Text("\(loops.count) recurring agent loop\(loops.count == 1 ? "" : "s")")
                    .font(.mobileDeckSans(13))
                    .foregroundStyle(MobileFlightDeckPalette.secondary)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(MobileFlightDeckPalette.background)
    }

    private var deviceMenu: some View {
        Button { showDeviceSelector = true } label: {
            HStack(spacing: 5) {
                Text(servers.active?.name ?? "All Devices")
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.mobileDeckSans(8, weight: .semibold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
            }
            .font(.mobileDeckSans(13))
            .foregroundStyle(MobileFlightDeckPalette.secondary)
        }
        .buttonStyle(.plain)
    }

    private var fleetStrip: some View {
        HStack(spacing: 0) {
            fleetMetric(needsInputSessions.count, "NEED YOU", MobileFlightDeckPalette.amber)
            fleetMetric(liveSessions.count, "ACTIVE", MobileFlightDeckPalette.green)
            fleetMetric(sessions.filter { $0.resolvedState == .idle }.count, "IDLE", MobileFlightDeckPalette.secondary)
            fleetMetric(archivedCount, "ARCHIVED", MobileFlightDeckPalette.muted)
        }
    }

    private func fleetMetric(_ count: Int, _ label: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(String(format: "%02d", count))
            Text(label)
        }
        .font(.mobileDeckMono(8))
        .foregroundStyle(color)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var currentTab: some View {
        switch selectedTab {
        case .command:
            commandContent
        case .inbox:
            inboxContent
        case .workspaces:
            workspacesContent
        case .loops:
            loopsContent
        }
    }

    private var commandContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if servers.servers.isEmpty {
                    emptyCard("NO CONNECTIONS", "Add a device to start controlling agent sessions.", action: "Add connection", onShowConnections)
                } else if let loadError, sessions.isEmpty {
                    emptyCard("DEVICE OFFLINE", loadError, action: "Retry") {
                        Task { await onRefresh() }
                    }
                } else {
                    sectionHeading("Needs you", trailing: needsInputSessions.isEmpty ? "Clear" : "View inbox") {
                        selectedTab = .inbox
                    }

                    if needsInputSessions.isEmpty {
                        quietState("No decisions waiting", "The queue is clear across this device.")
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(needsInputSessions.prefix(3).enumerated()), id: \.element.id) { index, session in
                                agentRow(session, attention: true)
                                if index < min(needsInputSessions.count, 3) - 1 {
                                    Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                                }
                            }
                        }
                        .mobileDeckCard(radius: 14)
                    }

                    sectionHeading("Live agents", trailing: "\(liveSessions.count) active") {}

                    if liveSessions.isEmpty {
                        quietState("No agents running", hasLoaded ? "Active work will appear here." : "Loading your fleet…")
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(liveSessions.prefix(4).enumerated()), id: \.element.id) { index, session in
                                agentRow(session, attention: false)
                                if index < min(liveSessions.count, 4) - 1 {
                                    Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                                }
                            }
                        }
                        .mobileDeckCard(radius: 14)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .refreshable {
            await onRefresh()
            await loadSupplementaryData(refresh: true)
        }
    }

    private func agentRow(_ session: TmuxSession, attention: Bool) -> some View {
        Button { onOpenSession(session.name) } label: {
            HStack(spacing: 12) {
                Circle()
                    .fill(attention ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.green)
                    .frame(width: 9, height: 9)
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.name)
                        .font(.mobileDeckSans(15, weight: .semibold))
                        .foregroundStyle(MobileFlightDeckPalette.text)
                        .lineLimit(1)
                    Text(session.detail ?? session.currentAction ?? (attention ? "Decision waiting" : "Working"))
                        .font(.mobileDeckSans(12))
                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                        .lineLimit(1)
                    Text("\(servers.active?.name.uppercased() ?? "DEVICE") · \((session.agent ?? .shell).displayName.uppercased()) · \(relativeMobileTime(session.lastOutputAt))")
                        .font(.mobileDeckMono(8))
                        .foregroundStyle(MobileFlightDeckPalette.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if attention {
                    Image(systemName: "chevron.right")
                        .font(.mobileDeckSans(11, weight: .bold))
                        .foregroundStyle(MobileFlightDeckPalette.muted)
                } else {
                    Text((session.agent ?? .shell).displayName.uppercased())
                        .font(.mobileDeckMono(8))
                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                }
            }
            .frame(minHeight: attention ? 72 : 64)
            .padding(.horizontal, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var inboxContent: some View {
        MobileInboxContent(items: inbox.items, loading: inbox.loading, onOpenSession: onOpenSession)
            .refreshable { await inbox.refresh() }
    }

    private var workspacesContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Saved repositories")
                        .font(.mobileDeckSans(16, weight: .semibold))
                    Spacer()
                    Button { showAddWorkspace = true } label: {
                        Image(systemName: "plus")
                            .font(.mobileDeckSans(16, weight: .bold))
                            .foregroundStyle(MobileFlightDeckPalette.onAccent)
                            .frame(width: 38, height: 38)
                            .background(MobileFlightDeckPalette.amber, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add workspace")
                }
                if workspaces.isEmpty {
                    quietState("No workspaces", "Save a repository to launch work from your phone.")
                } else {
                    ForEach(workspaces) { workspace in
                        Button { selectedWorkspace = workspace } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Text(workspace.name)
                                        .font(.mobileDeckSans(16, weight: .semibold))
                                    Spacer()
                                    Text("\(workspace.worktrees.count) CHECKOUTS")
                                        .font(.mobileDeckMono(8))
                                        .foregroundStyle(MobileFlightDeckPalette.muted)
                                }
                                Text(workspace.path)
                                    .font(.mobileDeckMono(9))
                                    .foregroundStyle(MobileFlightDeckPalette.secondary)
                                    .lineLimit(1)
                                HStack(spacing: 12) {
                                    mobileSignal("\(workspace.worktrees.filter(\.dirty).count) DIRTY", workspace.worktrees.contains(where: \.dirty) ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.muted)
                                    mobileSignal(workspace.origin == nil ? "LOCAL" : "REMOTE", MobileFlightDeckPalette.green)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.mobileDeckSans(10, weight: .bold))
                                        .foregroundStyle(MobileFlightDeckPalette.muted)
                                }
                            }
                            .padding(14)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .mobileDeckCard(radius: 14)
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await onRefresh() }
    }

    private var loopsContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if loops.isEmpty {
                    quietState("No recurring loops", supplementaryLoading ? "Loading scheduled work…" : "Recurring agent tasks will appear here.")
                } else {
                    ForEach(loops) { loop in
                        Button { selectedLoop = loop } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Circle()
                                        .fill(loop.enabled ? (loop.lastError == nil ? MobileFlightDeckPalette.green : MobileFlightDeckPalette.red) : MobileFlightDeckPalette.muted)
                                        .frame(width: 8, height: 8)
                                    Text(loop.name)
                                        .font(.mobileDeckSans(16, weight: .semibold))
                                    Spacer()
                                    Text(loop.enabled ? (loop.lastError == nil ? "HEALTHY" : "FAILED") : "PAUSED")
                                        .font(.mobileDeckMono(8))
                                        .foregroundStyle(loop.enabled ? (loop.lastError == nil ? MobileFlightDeckPalette.green : MobileFlightDeckPalette.red) : MobileFlightDeckPalette.muted)
                                }
                                Text(loop.prompt)
                                    .font(.mobileDeckSans(12))
                                    .foregroundStyle(MobileFlightDeckPalette.secondary)
                                    .lineLimit(2)
                                HStack {
                                    Text("\(loop.workspaceName.uppercased()) · \(loop.agent.displayName.uppercased())")
                                    Spacer()
                                    Text(loop.schedule.summary.uppercased())
                                    Image(systemName: "chevron.right")
                                        .font(.mobileDeckSans(9, weight: .bold))
                                        .foregroundStyle(MobileFlightDeckPalette.muted)
                                }
                                .font(.mobileDeckMono(8))
                                .foregroundStyle(MobileFlightDeckPalette.muted)
                            }
                            .padding(14)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .mobileDeckCard(radius: 14)
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await loadSupplementaryData(refresh: true) }
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(MobileDeckTab.allCases) { tab in
                Button { selectedTab = tab } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.icon)
                            .font(.mobileDeckSans(15, weight: .medium))
                        Text(tab.title)
                            .font(.mobileDeckSans(10, weight: selectedTab == tab ? .semibold : .medium))
                    }
                    .foregroundStyle(selectedTab == tab ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.secondary)
                    .frame(maxWidth: .infinity, minHeight: 48, maxHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 7)
        .padding(.bottom, 20)
        .frame(height: 78)
        .background(MobileFlightDeckPalette.surface)
        .overlay(alignment: .top) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
    }

    private func sectionHeading(_ title: String, trailing: String, action: @escaping () -> Void) -> some View {
        HStack {
            Text(title)
                .font(.mobileDeckSans(17, weight: .semibold))
            Spacer()
            Button(trailing, action: action)
                .buttonStyle(.plain)
                .font(.mobileDeckSans(13))
                .foregroundStyle(trailing == "View inbox" ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.secondary)
        }
    }

    private func emptyCard(_ eyebrow: String, _ message: String, action: String, _ handler: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(eyebrow)
                .font(.mobileDeckMono(9, weight: .semibold))
                .foregroundStyle(MobileFlightDeckPalette.amber)
            Text(message)
                .font(.mobileDeckSans(15))
                .foregroundStyle(MobileFlightDeckPalette.secondary)
            Button(action, action: handler)
                .font(.mobileDeckSans(13, weight: .bold))
                .foregroundStyle(MobileFlightDeckPalette.onAccent)
                .padding(.horizontal, 16)
                .frame(height: 38)
                .background(MobileFlightDeckPalette.amber, in: RoundedRectangle(cornerRadius: 9))
                .buttonStyle(.plain)
        }
        .padding(16)
        .mobileDeckCard(radius: 14)
    }

    private func quietState(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.mobileDeckSans(14, weight: .semibold))
            Text(detail)
                .font(.mobileDeckSans(12))
                .foregroundStyle(MobileFlightDeckPalette.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .mobileDeckCard(radius: 14)
    }

    private func loadSupplementaryData(refresh: Bool) async {
        guard let api = activeAPI else {
            loops = []
            archives = []
            pullRequests = []
            return
        }
        supplementaryLoading = loops.isEmpty && pullRequests.isEmpty
        async let loopsCall = api.loops()
        async let archivesCall = api.archives()
        async let pullRequestsCall = api.authoredPullRequests(refresh: refresh)
        loops = (try? await loopsCall) ?? []
        archives = (try? await archivesCall) ?? []
        pullRequests = ((try? await pullRequestsCall) ?? []).sorted { $0.updatedAt > $1.updatedAt }
        supplementaryLoading = false
    }
}

private struct MobileDeviceSelector: View {
    @ObservedObject private var servers = ServerStore.shared
    let onAddConnection: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(MobileFlightDeckPalette.strongBorder)
                .frame(width: 38, height: 5)
                .padding(.top, 9)
                .padding(.bottom, 7)

            HStack {
                Text("Device view")
                    .font(.mobileDeckSans(20, weight: .bold))
                Spacer()
                Button("Done") { dismiss() }
                    .font(.mobileDeckSans(13, weight: .semibold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
            }
            .frame(height: 52)

            VStack(spacing: 0) {
                deviceRow(title: "All Devices", subtitle: "\(servers.servers.count) paired devices", selected: servers.activeID == nil) {
                    servers.activeID = servers.servers.first?.id
                    dismiss()
                }
                deviceDivider
                ForEach(servers.servers) { server in
                    deviceRow(
                        title: server.name,
                        subtitle: "\(server.deviceID?.uppercased() ?? "DEVICE") · CONNECTED",
                        selected: server.id == servers.activeID
                    ) {
                        servers.activeID = server.id
                        dismiss()
                    }
                    if server.id != servers.servers.last?.id {
                        deviceDivider
                    }
                }
            }

            Button(action: onAddConnection) {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                    Text("Add connection")
                }
                .font(.mobileDeckSans(14, weight: .semibold))
                .foregroundStyle(MobileFlightDeckPalette.amber)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(MobileFlightDeckPalette.accentBorder))
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.surface)
    }

    private var deviceDivider: some View {
        Rectangle()
            .fill(MobileFlightDeckPalette.border)
            .frame(height: 1)
            .padding(.leading, 34)
    }

    private func deviceRow(title: String, subtitle: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 11) {
                Circle()
                    .fill(MobileFlightDeckPalette.green)
                    .frame(width: 10, height: 10)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.mobileDeckSans(15, weight: .semibold))
                        .foregroundStyle(MobileFlightDeckPalette.text)
                    Text(subtitle.uppercased())
                        .font(.mobileDeckMono(8))
                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                }
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .font(.mobileDeckSans(13, weight: .bold))
                        .foregroundStyle(MobileFlightDeckPalette.amber)
                }
            }
            .padding(.horizontal, 13)
            .frame(height: 58)
            .background(selected ? MobileFlightDeckPalette.raised : Color.clear, in: RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct MobileArchivesView: View {
    let archives: [ArchivedChat]
    let onClose: () -> Void
    @State private var query = ""

    private var visibleArchives: [ArchivedChat] {
        guard !query.isEmpty else { return archives }
        return archives.filter {
            $0.session.localizedCaseInsensitiveContains(query)
                || ($0.conversation.title?.localizedCaseInsensitiveContains(query) == true)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            mobileDetailHeader(title: "Archived Chats", subtitle: "\(archives.count) CHATS", trailing: "Select", onBack: onClose) {}
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                        TextField("Search archived chats", text: $query)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    .font(.mobileDeckSans(13))
                    .foregroundStyle(MobileFlightDeckPalette.secondary)
                    .padding(.horizontal, 13)
                    .frame(height: 38)
                    .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(MobileFlightDeckPalette.border))

                    HStack {
                        Text("Recently archived")
                            .font(.mobileDeckSans(16, weight: .semibold))
                        Spacer()
                        Text("HIDDEN FROM LIVE QUEUE")
                            .font(.mobileDeckMono(8))
                            .foregroundStyle(MobileFlightDeckPalette.muted)
                    }

                    if visibleArchives.isEmpty {
                        Text("No archived chats")
                            .font(.mobileDeckSans(14, weight: .semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .mobileDeckCard(radius: 12)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(visibleArchives.enumerated()), id: \.element.id) { index, archive in
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack {
                                        Text(archive.conversation.title ?? archive.session)
                                            .font(.mobileDeckSans(15, weight: .semibold))
                                        Spacer()
                                        Text(relativeMobileTime(archive.archivedAt / 1000))
                                            .font(.mobileDeckMono(8))
                                            .foregroundStyle(MobileFlightDeckPalette.muted)
                                    }
                                    Text(archive.conversation.entries.last?.text ?? "Completed conversation")
                                        .font(.mobileDeckSans(12))
                                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                                        .lineLimit(1)
                                    Text("\(archive.agent.displayName.uppercased()) · ARCHIVED")
                                        .font(.mobileDeckMono(8))
                                        .foregroundStyle(MobileFlightDeckPalette.muted)
                                }
                                .padding(.horizontal, 14)
                                .frame(minHeight: 78)
                                if index < visibleArchives.count - 1 {
                                    Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                                }
                            }
                        }
                        .mobileDeckCard(radius: 12)
                    }

                    Text("Archived chats stay out of the live queue while remaining available for reference.")
                        .font(.mobileDeckSans(12))
                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                        .padding(14)
                        .mobileDeckCard(radius: 12)
                }
                .padding(16)
            }
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
    }
}

private struct MobileConnectionsView: View {
    @ObservedObject private var servers = ServerStore.shared
    let onAddConnection: () -> Void
    let onOpenDoctor: () -> Void
    let onClose: () -> Void
    @State private var sharingServer: Server?

    var body: some View {
        VStack(spacing: 0) {
            mobileDetailHeader(title: "Connections", subtitle: "\(servers.servers.count) DEVICES", trailing: "+ Add", onBack: onClose, onTrailing: onAddConnection)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Paired devices")
                                .font(.mobileDeckSans(23, weight: .bold))
                            Text("Encrypted Mission Control connections")
                                .font(.mobileDeckSans(12))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                        }
                        Spacer()
                        Circle().fill(MobileFlightDeckPalette.green).frame(width: 10, height: 10)
                    }

                    VStack(spacing: 0) {
                        ForEach(Array(servers.servers.enumerated()), id: \.element.id) { index, server in
                            Button { servers.activeID = server.id } label: {
                                HStack(spacing: 11) {
                                    Circle().fill(MobileFlightDeckPalette.green).frame(width: 10, height: 10)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(server.name)
                                            .font(.mobileDeckSans(15, weight: .semibold))
                                            .foregroundStyle(MobileFlightDeckPalette.text)
                                        Text("\(server.deviceID?.uppercased() ?? "DEVICE") · CONNECTED")
                                            .font(.mobileDeckMono(8))
                                            .foregroundStyle(MobileFlightDeckPalette.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: server.id == servers.activeID ? "checkmark" : "chevron.right")
                                        .font(.mobileDeckSans(10, weight: .bold))
                                        .foregroundStyle(server.id == servers.activeID ? MobileFlightDeckPalette.amber : MobileFlightDeckPalette.muted)
                                }
                                .padding(.horizontal, 14)
                                .frame(height: 82)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if index < servers.servers.count - 1 {
                                Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                            }
                        }
                    }
                    .mobileDeckCard(radius: 12)

                    if let selected = servers.active {
                        Text("SELECTED DEVICE")
                            .font(.mobileDeckMono(9))
                            .foregroundStyle(MobileFlightDeckPalette.muted)
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(selected.name)
                                        .font(.mobileDeckSans(17, weight: .semibold))
                                    Text("SECURE LINK VERIFIED")
                                        .font(.mobileDeckMono(8))
                                        .foregroundStyle(MobileFlightDeckPalette.green)
                                }
                                Spacer()
                                Text("ACTIVE")
                                    .font(.mobileDeckMono(8))
                                    .foregroundStyle(MobileFlightDeckPalette.amber)
                            }
                            Text(selected.url)
                                .font(.mobileDeckMono(10))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                                .lineLimit(1)
                            Button {
                                sharingServer = selected
                            } label: {
                                Label("Share device setup", systemImage: "qrcode")
                                    .font(.mobileDeckSans(13, weight: .bold))
                                    .foregroundStyle(MobileFlightDeckPalette.onAccent)
                                    .frame(maxWidth: .infinity, minHeight: 42)
                                    .background(MobileFlightDeckPalette.amber, in: RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)

                            Button("Open Device Doctor", action: onOpenDoctor)
                                .font(.mobileDeckSans(13, weight: .semibold))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                                .frame(maxWidth: .infinity, minHeight: 42)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(MobileFlightDeckPalette.border))
                                .buttonStyle(.plain)
                        }
                        .padding(15)
                        .mobileDeckCard(radius: 12)
                    }
                }
                .padding(16)
            }
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
        .sheet(item: $sharingServer) { server in
            PairingShareSheet(server: server)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
}

private struct MobileDeviceDoctorView: View {
    let server: Server?
    let sessions: [TmuxSession]
    let workspaces: [Workspace]
    let onClose: () -> Void

    @State private var checking = true
    @State private var reachable = false

    private var checks: [(String, String, Bool)] {
        [
            ("Server reachable", reachable ? "READY" : "OFFLINE", reachable),
            ("Pairing token", server?.token.isEmpty == false ? "CONFIGURED" : "MISSING", server?.token.isEmpty == false),
            ("Sessions", "\(sessions.count) VISIBLE", reachable),
            ("Workspaces", "\(workspaces.count) VISIBLE", reachable),
            ("Notifications", "CONNECTED", reachable),
        ]
    }

    private var healthyCount: Int { checks.filter(\.2).count }

    var body: some View {
        VStack(spacing: 0) {
            mobileDetailHeader(title: "Device Doctor", subtitle: server?.name.uppercased() ?? "NO DEVICE", trailing: "Run", onBack: onClose) {
                Task { await runDiagnostics() }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(checking ? "Running checks" : "\(healthyCount) of \(checks.count) healthy")
                                .font(.mobileDeckSans(23, weight: .bold))
                            Text(healthyCount == checks.count ? "All systems nominal" : "Action recommended")
                                .font(.mobileDeckSans(13))
                                .foregroundStyle(healthyCount == checks.count ? MobileFlightDeckPalette.green : MobileFlightDeckPalette.amber)
                        }
                        Spacer()
                        Text("\(healthyCount)/\(checks.count)")
                            .font(.mobileDeckSans(16, weight: .bold))
                            .frame(width: 54, height: 54)
                            .background(MobileFlightDeckPalette.raised, in: Circle())
                            .overlay(Circle().stroke(healthyCount == checks.count ? MobileFlightDeckPalette.green : MobileFlightDeckPalette.amber))
                    }
                    .padding(16)
                    .mobileDeckCard(radius: 12)

                    VStack(spacing: 0) {
                        ForEach(Array(checks.enumerated()), id: \.offset) { index, check in
                            HStack(spacing: 12) {
                                Text(check.2 ? "✓" : "!")
                                    .font(.mobileDeckMono(14, weight: .semibold))
                                    .foregroundStyle(check.2 ? MobileFlightDeckPalette.green : MobileFlightDeckPalette.amber)
                                    .frame(width: 26, alignment: .leading)
                                Text(check.0)
                                    .font(.mobileDeckSans(14, weight: .medium))
                                Spacer()
                                Text(check.1)
                                    .font(.mobileDeckMono(8))
                                    .foregroundStyle(check.2 ? MobileFlightDeckPalette.secondary : MobileFlightDeckPalette.amber)
                            }
                            .padding(.horizontal, 14)
                            .frame(height: 50)
                            if index < checks.count - 1 {
                                Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                            }
                        }
                    }
                    .mobileDeckCard(radius: 12)
                }
                .padding(16)
            }
            HStack(spacing: 10) {
                Button("Run diagnostics") { Task { await runDiagnostics() } }
                    .mobileDoctorButton(primary: false)
                Button(reachable ? "Device healthy" : "Open connections") {
                    if !reachable { onClose() }
                }
                .mobileDoctorButton(primary: true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(MobileFlightDeckPalette.surface)
            .overlay(alignment: .top) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
        .task { await runDiagnostics() }
    }

    private func runDiagnostics() async {
        checking = true
        defer { checking = false }
        guard let server, let api = APIClient(urlString: server.url, token: server.token) else {
            reachable = false
            return
        }
        reachable = (try? await api.health()) != nil
    }
}

func mobileDetailHeader(
    title: String,
    subtitle: String,
    trailing: String,
    onBack: @escaping () -> Void,
    onTrailing: @escaping () -> Void
) -> some View {
    HStack(spacing: 0) {
        Button(action: onBack) {
            Image(systemName: "chevron.left")
                .font(.mobileDeckSans(17, weight: .semibold))
                .foregroundStyle(MobileFlightDeckPalette.amber)
                .frame(width: 66, height: 58)
        }
        .buttonStyle(.plain)
        VStack(spacing: 1) {
            Text(title)
                .font(.mobileDeckSans(16, weight: .semibold))
            Text(subtitle)
                .font(.mobileDeckMono(8))
                .foregroundStyle(MobileFlightDeckPalette.muted)
        }
        .frame(maxWidth: .infinity)
        Button(trailing, action: onTrailing)
            .buttonStyle(.plain)
            .font(.mobileDeckSans(13, weight: .semibold))
            .foregroundStyle(MobileFlightDeckPalette.amber)
            .frame(width: 66, height: 58)
    }
    .frame(height: 58)
    .overlay(alignment: .bottom) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
}

extension View {
    func mobileDoctorButton(primary: Bool) -> some View {
        font(.mobileDeckSans(13, weight: .bold))
            .foregroundStyle(primary ? MobileFlightDeckPalette.onAccent : MobileFlightDeckPalette.text)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(primary ? MobileFlightDeckPalette.amber : Color.clear, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(primary ? Color.clear : MobileFlightDeckPalette.border))
            .buttonStyle(.plain)
    }
}

private struct MobileCommandMenu: View {
    let archivedCount: Int
    let onQuickOpen: () -> Void
    let onPullRequests: () -> Void
    let onArchives: () -> Void
    let onConnections: () -> Void
    let onDoctor: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(MobileFlightDeckPalette.strongBorder)
                .frame(width: 38, height: 5)
                .padding(.top, 9)
                .padding(.bottom, 7)

            HStack {
                Text("Mission Control")
                    .font(.mobileDeckSans(20, weight: .bold))
                Spacer()
                Button("Done") { dismiss() }
                    .font(.mobileDeckSans(13, weight: .semibold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
            }
            .frame(height: 52)

            VStack(spacing: 0) {
                menuRow("magnifyingglass", "Quick open", action: onQuickOpen)
                divider
                menuRow("arrow.triangle.pull", "Pull requests", action: onPullRequests)
                divider
                menuRow("archivebox", "Archived chats", badge: archivedCount == 0 ? nil : "\(archivedCount)", action: onArchives)
                divider
                menuRow("link", "Connections", action: onConnections)
                divider
                menuRow("stethoscope", "Device Doctor", subtitle: "Check connection health", action: onDoctor)
            }
            .background(MobileFlightDeckPalette.background, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(MobileFlightDeckPalette.border))
            .clipShape(RoundedRectangle(cornerRadius: 14))

            Button("Cancel") { dismiss() }
                .font(.mobileDeckSans(14, weight: .semibold))
                .foregroundStyle(MobileFlightDeckPalette.text)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(MobileFlightDeckPalette.background, in: RoundedRectangle(cornerRadius: 12))
                .buttonStyle(.plain)
                .padding(.top, 12)
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.surface)
    }

    private var divider: some View {
        Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
    }

    private func menuRow(
        _ icon: String,
        _ title: String,
        subtitle: String? = nil,
        badge: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.mobileDeckSans(15, weight: .medium))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.mobileDeckSans(14))
                        .foregroundStyle(MobileFlightDeckPalette.text)
                    if let subtitle {
                        Text(subtitle)
                            .font(.mobileDeckSans(10))
                            .foregroundStyle(MobileFlightDeckPalette.amber)
                    }
                }
                Spacer()
                if let badge {
                    Text(badge)
                        .font(.mobileDeckMono(9))
                        .foregroundStyle(MobileFlightDeckPalette.amber)
                        .padding(.horizontal, 8)
                        .frame(height: 22)
                        .background(MobileFlightDeckPalette.raised, in: Capsule())
                } else {
                    Image(systemName: "chevron.right")
                        .font(.mobileDeckSans(10, weight: .bold))
                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                }
            }
            .padding(.horizontal, 13)
            .frame(minHeight: 53)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct MobileInboxContent: View {
    let items: [InboxItem]
    let loading: Bool
    let onOpenSession: (String) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 13) {
                if items.isEmpty {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(loading ? "Loading decisions…" : "Nothing waiting")
                            .font(.mobileDeckSans(15, weight: .semibold))
                        Text("Anything that needs you will land here.")
                            .font(.mobileDeckSans(12))
                            .foregroundStyle(MobileFlightDeckPalette.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .mobileDeckCard(radius: 14)
                } else {
                    ForEach(items) { item in
                        Button { onOpenSession(item.session) } label: {
                            VStack(alignment: .leading, spacing: 11) {
                                HStack {
                                    Text(item.question == nil ? "AUTHORIZATION REQUIRED" : "QUESTION")
                                        .font(.mobileDeckMono(8, weight: .semibold))
                                        .foregroundStyle(MobileFlightDeckPalette.amber)
                                    Spacer()
                                    Text("\(item.serverName.uppercased()) · \(relativeMobileTime(item.waitingSince / 1000))")
                                        .font(.mobileDeckMono(8))
                                        .foregroundStyle(MobileFlightDeckPalette.muted)
                                }
                                Text(item.question?.question ?? item.detail ?? "A session needs your decision")
                                    .font(.mobileDeckSans(16, weight: .semibold))
                                    .foregroundStyle(MobileFlightDeckPalette.text)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("\(item.session) · \(item.question == nil ? "Agent" : "Question")")
                                    .font(.mobileDeckSans(11))
                                    .foregroundStyle(MobileFlightDeckPalette.secondary)
                                HStack(spacing: 8) {
                                    Text(item.question == nil ? "Approve" : "Reply")
                                        .font(.mobileDeckSans(12, weight: .bold))
                                        .foregroundStyle(item.question == nil ? MobileFlightDeckPalette.onAccent : MobileFlightDeckPalette.amber)
                                        .padding(.horizontal, 15)
                                        .frame(height: 38)
                                        .background(item.question == nil ? MobileFlightDeckPalette.amber : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(MobileFlightDeckPalette.amber.opacity(item.question == nil ? 0 : 0.7)))
                                    Text("Open")
                                        .font(.mobileDeckSans(12))
                                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                                        .padding(.horizontal, 15)
                                        .frame(height: 38)
                                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(MobileFlightDeckPalette.border))
                                }
                            }
                            .padding(16)
                            .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(MobileFlightDeckPalette.border))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
    }
}

private struct MobilePullRequestsView: View {
    @Binding var pullRequests: [AuthoredPullRequest]
    let sessions: [TmuxSession]
    let api: APIClient?
    let onRefresh: () async -> Void
    let onOpenSession: (String) -> Void
    let onClose: () -> Void

    @State private var filter: PullRequestFilter = .all
    @State private var refreshing = false

    private enum PullRequestFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case ready = "Ready"
        case drafts = "Drafts"
        var id: String { rawValue }
    }

    private var filteredPullRequests: [AuthoredPullRequest] {
        switch filter {
        case .all: return pullRequests
        case .ready: return pullRequests.filter { !$0.isDraft }
        case .drafts: return pullRequests.filter(\.isDraft)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            listHeader
            ScrollView {
                LazyVStack(spacing: 14) {
                    filterBar
                    if filteredPullRequests.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(refreshing ? "Refreshing pull requests…" : "No pull requests")
                                .font(.mobileDeckSans(15, weight: .semibold))
                            Text("Open authored pull requests will appear here.")
                                .font(.mobileDeckSans(12))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(15)
                        .mobileDeckCard(radius: 14)
                    } else {
                        ForEach(filteredPullRequests) { pullRequest in
                            NavigationLink {
                                MobilePullRequestDetailView(
                                    pullRequest: pullRequest,
                                    sessions: sessions,
                                    api: api,
                                    onOpenSession: onOpenSession
                                )
                            } label: {
                                pullRequestRow(pullRequest)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            }
            .refreshable { await refresh() }
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private var listHeader: some View {
        HStack(spacing: 0) {
            Button(action: onClose) {
                Image(systemName: "chevron.left")
                    .font(.mobileDeckSans(18, weight: .semibold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
                    .frame(width: 50, height: 58)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text("Pull requests")
                    .font(.mobileDeckSans(24, weight: .bold))
                    .tracking(-0.6)
                Text("AUTHORED BY YOU · \(pullRequests.count) TOTAL")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(MobileFlightDeckPalette.muted)
            }
            Spacer()
            Button { Task { await refresh() } } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.mobileDeckSans(15, weight: .semibold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
                    .frame(width: 40, height: 40)
                    .overlay(Circle().stroke(MobileFlightDeckPalette.border))
            }
            .buttonStyle(.plain)
            .disabled(refreshing)
            .padding(.trailing, 16)
        }
        .frame(height: 76)
        .overlay(alignment: .bottom) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
    }

    private var filterBar: some View {
        HStack(spacing: 0) {
            ForEach(PullRequestFilter.allCases) { option in
                Button {
                    filter = option
                } label: {
                    Text("\(option.rawValue) · \(count(for: option))")
                        .font(.mobileDeckSans(13, weight: option == filter ? .semibold : .regular))
                        .foregroundStyle(option == filter ? MobileFlightDeckPalette.text : MobileFlightDeckPalette.secondary)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(option == filter ? MobileFlightDeckPalette.raised : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .frame(height: 42)
        .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(MobileFlightDeckPalette.border))
    }

    private func count(for filter: PullRequestFilter) -> Int {
        switch filter {
        case .all: return pullRequests.count
        case .ready: return pullRequests.filter { !$0.isDraft }.count
        case .drafts: return pullRequests.filter(\.isDraft).count
        }
    }

    private func pullRequestRow(_ pullRequest: AuthoredPullRequest) -> some View {
        let signal = mobilePullRequestSignal(pullRequest)
        let activeSession = matchingMobileSession(for: pullRequest, sessions: sessions)
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 10) {
                Text("PR")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(signal)
                    .frame(width: 28, height: 28)
                    .overlay(Rectangle().stroke(signal))
                VStack(alignment: .leading, spacing: 3) {
                    Text(pullRequest.title)
                        .font(.mobileDeckSans(16, weight: .semibold))
                        .foregroundStyle(MobileFlightDeckPalette.text)
                        .multilineTextAlignment(.leading)
                    Text("\(pullRequest.repository.uppercased()) · \(pullRequest.headRefName.uppercased())")
                        .font(.mobileDeckMono(8))
                        .foregroundStyle(MobileFlightDeckPalette.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(verbatim: "#\(pullRequest.number)")
                    .font(.mobileDeckMono(9))
                    .foregroundStyle(MobileFlightDeckPalette.muted)
            }
            HStack(spacing: 11) {
                Text(pullRequest.isDraft ? "DRAFT" : "READY")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(pullRequest.isDraft ? MobileFlightDeckPalette.secondary : MobileFlightDeckPalette.green)
                    .padding(.horizontal, 7)
                    .frame(height: 22)
                    .overlay(Rectangle().stroke(pullRequest.isDraft ? MobileFlightDeckPalette.strongBorder : MobileFlightDeckPalette.green))
                Text(mobilePullRequestActivity(pullRequest))
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(signal)
                Spacer()
                if activeSession != nil {
                    HStack(spacing: 5) {
                        Circle().fill(MobileFlightDeckPalette.green).frame(width: 6, height: 6)
                        Text("ACTIVE")
                    }
                    .foregroundStyle(MobileFlightDeckPalette.green)
                } else {
                    Text(relativeMobileISOTime(pullRequest.updatedAt))
                        .foregroundStyle(MobileFlightDeckPalette.muted)
                }
            }
            .font(.mobileDeckMono(8))
            .padding(.leading, 38)
        }
        .padding(14)
        .background(pullRequest.failedCheckCount > 0 ? MobileFlightDeckPalette.raised : MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(pullRequest.failedCheckCount > 0 ? Color.clear : MobileFlightDeckPalette.border)
        }
        .overlay(alignment: .leading) {
            if pullRequest.failedCheckCount > 0 {
                UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14)
                    .fill(MobileFlightDeckPalette.amber)
                    .frame(width: 3)
            }
        }
    }

    private func refresh() async {
        refreshing = true
        await onRefresh()
        refreshing = false
    }
}

private struct MobilePullRequestDetailView: View {
    let pullRequest: AuthoredPullRequest
    let sessions: [TmuxSession]
    let api: APIClient?
    let onOpenSession: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var toasts: ToastCenter
    @State private var launching = false

    private var activeSession: TmuxSession? {
        matchingMobileSession(for: pullRequest, sessions: sessions)
    }

    private var isChecksView: Bool { pullRequest.failedCheckCount > 0 }

    var body: some View {
        VStack(spacing: 0) {
            detailNavigation
            ScrollView {
                LazyVStack(alignment: .leading, spacing: isChecksView ? 11 : 12) {
                    hero
                    attentionAlert
                    telemetry
                    if isChecksView {
                        failedChecks
                    } else {
                        unreadReviewActivity
                    }
                }
                .padding(16)
            }
            bottomActions
        }
        .foregroundStyle(MobileFlightDeckPalette.text)
        .background(MobileFlightDeckPalette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task { await markViewed() }
    }

    private var detailNavigation: some View {
        HStack(spacing: 0) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.mobileDeckSans(17, weight: .semibold))
                    .foregroundStyle(MobileFlightDeckPalette.amber)
                    .frame(width: 58, height: 58)
            }
            .buttonStyle(.plain)
            VStack(spacing: 1) {
                Text("Pull Request #\(pullRequest.number)")
                    .font(.mobileDeckSans(16, weight: .semibold))
                Text("\(pullRequest.repository.uppercased()) · \(pullRequest.headRefName.uppercased())")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(MobileFlightDeckPalette.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            Button {
                guard let url = URL(string: pullRequest.url) else { return }
                openURL(url)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.mobileDeckSans(16, weight: .bold))
                    .foregroundStyle(MobileFlightDeckPalette.secondary)
                    .frame(width: 58, height: 58)
            }
            .buttonStyle(.plain)
        }
        .frame(height: 58)
        .overlay(alignment: .bottom) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 10) {
                Text(pullRequest.title)
                    .font(.mobileDeckSans(23, weight: .bold))
                    .tracking(-0.6)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Text(pullRequest.isDraft ? "DRAFT" : "READY")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(pullRequest.isDraft ? MobileFlightDeckPalette.secondary : MobileFlightDeckPalette.green)
                    .padding(.horizontal, 7)
                    .frame(height: 22)
                    .overlay(Rectangle().stroke(pullRequest.isDraft ? MobileFlightDeckPalette.strongBorder : MobileFlightDeckPalette.green))
            }
            Text("\(pullRequest.headRefName.uppercased()) → \(pullRequest.baseRefName.uppercased()) · UPDATED \(relativeMobileISOTime(pullRequest.updatedAt))")
                .font(.mobileDeckMono(8))
                .foregroundStyle(MobileFlightDeckPalette.muted)
                .lineLimit(1)
        }
    }

    private var attentionAlert: some View {
        let color = isChecksView ? MobileFlightDeckPalette.red : MobileFlightDeckPalette.amber
        return HStack(alignment: .top, spacing: 11) {
            Text("!")
                .font(.mobileDeckMono(18))
                .foregroundStyle(color)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 4) {
                Text(isChecksView ? "\(pullRequest.failedCheckCount) REQUIRED CHECK\(pullRequest.failedCheckCount == 1 ? "" : "S") FAILED" : "\(pullRequest.resolvedUnreadComments.count) COMMENTS SINCE YOU LAST LOOKED")
                    .font(.mobileDeckMono(9, weight: .semibold))
                    .foregroundStyle(color)
                Text(activeSession == nil ? "This PR has no active Mission Control session." : "A live \((activeSession?.agent ?? .shell).displayName) session is already targeting this PR branch.")
                    .font(.mobileDeckSans(14))
                    .foregroundStyle(MobileFlightDeckPalette.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MobileFlightDeckPalette.raised, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(color.opacity(0.75)))
    }

    private var telemetry: some View {
        HStack(spacing: isChecksView ? 8 : 10) {
            metric("CHECKS", "\(pullRequest.passedCheckCount) / \(pullRequest.checks.count)", pullRequest.failedCheckCount > 0 ? "\(pullRequest.failedCheckCount) FAILED" : "PASSING", pullRequest.failedCheckCount > 0 ? MobileFlightDeckPalette.red : MobileFlightDeckPalette.green)
            metric("REVIEW", mobileReviewValue(pullRequest), mobileReviewStatus(pullRequest), MobileFlightDeckPalette.amber)
            if isChecksView {
                metric("CHANGES", "\(pullRequest.changedFiles) files", "+\(pullRequest.additions)", MobileFlightDeckPalette.green)
            }
        }
    }

    private func metric(_ label: String, _ value: String, _ detail: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.mobileDeckMono(8))
                .foregroundStyle(MobileFlightDeckPalette.muted)
            Text(value)
                .font(.mobileDeckSans(isChecksView ? 18 : 19, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(detail)
                .font(.mobileDeckMono(8))
                .foregroundStyle(color)
                .lineLimit(1)
        }
        .padding(.horizontal, isChecksView ? 11 : 13)
        .frame(maxWidth: .infinity, minHeight: isChecksView ? 72 : 76, alignment: .leading)
        .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(MobileFlightDeckPalette.border))
    }

    private var failedChecks: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                Text("Failed checks")
                    .font(.mobileDeckSans(16, weight: .semibold))
                Spacer()
                Text("LATEST COMMIT")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(MobileFlightDeckPalette.muted)
            }
            VStack(spacing: 0) {
                ForEach(Array(pullRequest.checks.filter { $0.state == "fail" }.enumerated()), id: \.element.id) { index, check in
                    HStack(spacing: 0) {
                        Text("×")
                            .foregroundStyle(MobileFlightDeckPalette.red)
                            .frame(width: 24, alignment: .leading)
                        Text(check.name.uppercased())
                            .font(.mobileDeckMono(10, weight: .medium))
                        Spacer()
                        Text("FAIL")
                            .font(.mobileDeckMono(9))
                            .foregroundStyle(MobileFlightDeckPalette.red)
                    }
                    .padding(.horizontal, 13)
                    .frame(height: 48)
                    if index < pullRequest.failedCheckCount - 1 {
                        Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1)
                    }
                }
            }
            .background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(MobileFlightDeckPalette.border))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 6) {
                Text("LATEST FAILURE")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(MobileFlightDeckPalette.muted)
                Text("Open the active session or terminal to inspect the failure output.")
                    .font(.mobileDeckMono(10, weight: .medium))
                    .foregroundStyle(MobileFlightDeckPalette.text)
                Text("The check result is synchronized from GitHub.")
                    .font(.mobileDeckMono(9))
                    .foregroundStyle(MobileFlightDeckPalette.secondary)
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MobileFlightDeckPalette.terminal, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(MobileFlightDeckPalette.border))
        }
    }

    private var unreadReviewActivity: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                Text("Unread review activity")
                    .font(.mobileDeckSans(16, weight: .semibold))
                Spacer()
                Text("\(pullRequest.resolvedUnreadComments.count) TOTAL")
                    .font(.mobileDeckMono(8))
                    .foregroundStyle(MobileFlightDeckPalette.muted)
            }
            let comments = pullRequest.resolvedUnreadComments.isEmpty ? pullRequest.comments : pullRequest.resolvedUnreadComments
            if comments.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    Text("No unread comments")
                        .font(.mobileDeckSans(14, weight: .semibold))
                    Text("Review activity is up to date.")
                        .font(.mobileDeckSans(12))
                        .foregroundStyle(MobileFlightDeckPalette.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(13)
                .mobileDeckCard(radius: 12)
            } else {
                ForEach(comments.prefix(4)) { comment in
                    HStack(alignment: .top, spacing: 11) {
                        Text(initials(comment.author))
                            .font(.mobileDeckMono(8))
                            .foregroundStyle(MobileFlightDeckPalette.secondary)
                            .frame(width: 30, height: 30)
                            .overlay(Rectangle().stroke(MobileFlightDeckPalette.strongBorder))
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(comment.author) commented")
                                .font(.mobileDeckSans(14, weight: .semibold))
                            Text("“\(comment.body)”")
                                .font(.mobileDeckSans(12))
                                .foregroundStyle(MobileFlightDeckPalette.secondary)
                                .lineLimit(3)
                            Text([comment.path, relativeMobileISOTime(comment.createdAt)].compactMap { $0 }.joined(separator: " · ").uppercased())
                                .font(.mobileDeckMono(8))
                                .foregroundStyle(MobileFlightDeckPalette.muted)
                        }
                    }
                    .padding(13)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .mobileDeckCard(radius: 12)
                }
            }
        }
    }

    private var bottomActions: some View {
        HStack(spacing: 10) {
            Button {
                Task { await openOrLaunchSession() }
            } label: {
                Text(activeSession == nil ? "Launch shell" : "Open active session")
                    .font(.mobileDeckSans(13, weight: .bold))
                    .foregroundStyle(MobileFlightDeckPalette.onAccent)
                    .frame(maxWidth: .infinity, minHeight: 42)
                    .background(MobileFlightDeckPalette.amber, in: RoundedRectangle(cornerRadius: 11))
            }
            .buttonStyle(.plain)
            .disabled(launching)

            Button {
                if isChecksView, let activeSession {
                    onOpenSession(activeSession.name)
                } else if let url = URL(string: pullRequest.url) {
                    openURL(url)
                }
            } label: {
                Text(isChecksView ? "Terminal" : "GitHub ↗")
                    .font(.mobileDeckSans(13))
                    .foregroundStyle(MobileFlightDeckPalette.secondary)
                    .frame(width: isChecksView ? 96 : 100, height: 42)
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(MobileFlightDeckPalette.border))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(MobileFlightDeckPalette.surface)
        .overlay(alignment: .top) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
    }

    private func markViewed() async {
        guard pullRequest.hasUnreadActivity else { return }
        try? await api?.markPullRequestRead(repository: pullRequest.repository, number: pullRequest.number)
    }

    private func openOrLaunchSession() async {
        if let activeSession {
            onOpenSession(activeSession.name)
            return
        }
        guard let api else { return }
        launching = true
        defer { launching = false }
        do {
            let session = try await api.openPullRequestSession(
                workspaceID: pullRequest.workspaceId,
                branch: pullRequest.headRefName,
                number: pullRequest.number
            )
            guard !session.isEmpty else { return }
            toasts.show(.success, "Pull request shell launched")
            onOpenSession(session)
        } catch {
            toasts.show(.error, error.localizedDescription)
        }
    }
}

extension View {
    func mobileDeckCard(radius: CGFloat) -> some View {
        background(MobileFlightDeckPalette.surface, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(MobileFlightDeckPalette.border))
    }
}

private func mobileSignal(_ text: String, _ color: Color) -> some View {
    Text(text)
        .font(.mobileDeckMono(8))
        .foregroundStyle(color)
}

private func matchingMobileSession(for pullRequest: AuthoredPullRequest, sessions: [TmuxSession]) -> TmuxSession? {
    guard let worktreePath = pullRequest.worktreePath else { return nil }
    let normalized = worktreePath.hasSuffix("/") ? worktreePath : worktreePath + "/"
    return sessions.first { session in
        session.panePath == worktreePath || session.panePath.hasPrefix(normalized)
    }
}

private func mobilePullRequestSignal(_ pullRequest: AuthoredPullRequest) -> Color {
    if pullRequest.failedCheckCount > 0 { return MobileFlightDeckPalette.red }
    if !pullRequest.resolvedUnreadComments.isEmpty || pullRequest.hasUnreadActivity { return MobileFlightDeckPalette.amber }
    if pullRequest.isDraft { return MobileFlightDeckPalette.secondary }
    return MobileFlightDeckPalette.green
}

private func mobilePullRequestActivity(_ pullRequest: AuthoredPullRequest) -> String {
    if pullRequest.failedCheckCount > 0 { return "\(pullRequest.failedCheckCount) CHECKS FAILING" }
    if !pullRequest.resolvedUnreadComments.isEmpty { return "\(pullRequest.resolvedUnreadComments.count) NEW COMMENTS" }
    if pullRequest.checks.isEmpty { return mobileReviewStatus(pullRequest) }
    return "\(pullRequest.passedCheckCount)/\(pullRequest.checks.count) · \(mobileReviewStatus(pullRequest))"
}

private func mobileReviewValue(_ pullRequest: AuthoredPullRequest) -> String {
    switch pullRequest.reviewDecision {
    case "APPROVED": return "Approved"
    case "CHANGES_REQUESTED": return "Changes"
    case "REVIEW_REQUIRED": return "Pending"
    default: return pullRequest.isDraft ? "Draft" : "Open"
    }
}

private func mobileReviewStatus(_ pullRequest: AuthoredPullRequest) -> String {
    switch pullRequest.reviewDecision {
    case "APPROVED": return "APPROVED"
    case "CHANGES_REQUESTED": return "REQUESTED"
    case "REVIEW_REQUIRED": return "REVIEW NEEDED"
    default: return pullRequest.isDraft ? "DRAFT" : "ACTIVE"
    }
}

private func initials(_ name: String) -> String {
    let words = name.split(whereSeparator: { !$0.isLetter && !$0.isNumber })
    let letters = words.prefix(2).compactMap(\.first).map(String.init).joined()
    return letters.isEmpty ? String(name.prefix(2)).uppercased() : letters.uppercased()
}

func relativeMobileTime(_ seconds: TimeInterval) -> String {
    let elapsed = max(Date().timeIntervalSince1970 - seconds, 0)
    if elapsed < 60 { return "NOW" }
    if elapsed < 3600 { return "\(Int(elapsed / 60))M" }
    if elapsed < 86_400 { return "\(Int(elapsed / 3600))H" }
    return "\(Int(elapsed / 86_400))D"
}

private func relativeMobileISOTime(_ isoString: String?) -> String {
    guard let isoString, !isoString.isEmpty else { return "RECENTLY" }
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: isoString) else { return "RECENTLY" }
    return relativeMobileTime(date.timeIntervalSince1970) + " AGO"
}
#endif
