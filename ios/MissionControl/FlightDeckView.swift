#if targetEnvironment(macCatalyst)
import Darwin
import AVKit
import SwiftUI
import UIKit

enum FlightDeckPalette {
    static let background = Color(red: 11 / 255, green: 13 / 255, blue: 14 / 255)
    static let sidebar = Color(red: 13 / 255, green: 15 / 255, blue: 16 / 255)
    static let surface = Color(red: 21 / 255, green: 25 / 255, blue: 27 / 255)
    static let chrome = Color(red: 14 / 255, green: 17 / 255, blue: 18 / 255)
    static let conversation = Color(red: 17 / 255, green: 20 / 255, blue: 22 / 255)
    static let raised = Color(red: 32 / 255, green: 35 / 255, blue: 29 / 255)
    static let terminal = Color(red: 5 / 255, green: 7 / 255, blue: 6 / 255)
    static let border = Color(red: 52 / 255, green: 59 / 255, blue: 64 / 255)
    static let strongBorder = Color(red: 76 / 255, green: 86 / 255, blue: 91 / 255)
    static let text = Color(red: 243 / 255, green: 239 / 255, blue: 228 / 255)
    static let secondary = Color(red: 143 / 255, green: 152 / 255, blue: 147 / 255)
    static let muted = Color(red: 96 / 255, green: 106 / 255, blue: 101 / 255)
    static let warm = Color(red: 192 / 255, green: 183 / 255, blue: 157 / 255)
    static let amber = Color(red: 255 / 255, green: 176 / 255, blue: 32 / 255)
    static let green = Color(red: 86 / 255, green: 197 / 255, blue: 138 / 255)
    static let red = Color(red: 217 / 255, green: 92 / 255, blue: 92 / 255)
    static let onAccent = Color(red: 20 / 255, green: 17 / 255, blue: 10 / 255)
}

private enum FlightDeckLayout {
    static let indexWidth: CGFloat = 360
}

struct FlightDeckModalLayer<Content: View>: View {
    let onDismiss: () -> Void
    var dismissOnBackdrop = true
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            Color.black.opacity(0.72)
                .contentShape(Rectangle())
                .onTapGesture {
                    if dismissOnBackdrop { onDismiss() }
                }

            content()
                .background(FlightDeckPalette.background)
                .overlay(Rectangle().stroke(FlightDeckPalette.strongBorder))
                .shadow(color: .black.opacity(0.5), radius: 30, y: 18)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .zIndex(100)
    }
}

struct FlightDeckModalHeader: View {
    let eyebrow: String
    let title: String
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                flightLabel(eyebrow)
                Text(title)
                    .font(.flightSans(24, weight: .bold))
            }
            Spacer()
            Button("CANCEL", action: onCancel)
                .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
        }
        .padding(24)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }
}

struct FlightDeckDialogModal<Content: View, Actions: View>: View {
    let eyebrow: String
    let title: String
    let message: String
    @ViewBuilder let content: () -> Content
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel(eyebrow)
                Text(title)
                    .font(.flightSans(22, weight: .bold))
                Text(message)
                    .font(.flightSans(11))
                    .foregroundStyle(FlightDeckPalette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(24)

            content()
                .padding(.horizontal, 24)
                .padding(.bottom, 24)

            HStack(spacing: 10) {
                Spacer()
                actions()
            }
            .padding(18)
            .background(FlightDeckPalette.surface)
            .overlay(alignment: .top) { Divider().overlay(FlightDeckPalette.border) }
        }
        .frame(width: 520)
    }
}

struct FlightDeckTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.flightMono(10))
            .foregroundStyle(FlightDeckPalette.text)
            .padding(.horizontal, 13)
            .frame(height: 42)
            .background(FlightDeckPalette.surface)
            .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }
}

extension Font {
    static func flightMono(_ size: CGFloat, weight: Weight = .regular) -> Font {
        let resolvedSize: CGFloat
        switch size {
        case ...7: resolvedSize = 13
        case ...8: resolvedSize = 13.5
        case ...9: resolvedSize = 14
        default: resolvedSize = size * 1.4
        }
        return .custom("Geist Mono", fixedSize: resolvedSize).weight(weight)
    }

    static func flightSans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        let resolvedSize: CGFloat
        switch size {
        case ...9: resolvedSize = 15
        case ...10: resolvedSize = 16
        case ...11: resolvedSize = 17
        case ...12: resolvedSize = 18
        default: resolvedSize = size * 1.25
        }
        return .custom("Inter", fixedSize: resolvedSize).weight(weight)
    }
}

private struct FlightDeckAgent: Identifiable, Hashable {
    let server: Server
    let session: TmuxSession

    var id: String { "\(server.id)|\(session.name)" }
    var deviceCode: String { server.flightDeckCode }
}

private struct FlightDeckWorkspace: Identifiable, Hashable {
    let server: Server
    let workspace: Workspace

    var id: String { "\(server.id)|\(workspace.id)" }
    var deviceCode: String { server.flightDeckCode }
}

private struct FlightDeckLoop: Identifiable, Hashable {
    let server: Server
    let loop: MissionLoop

    var id: String { "\(server.id)|\(loop.id)" }
    var deviceCode: String { server.flightDeckCode }
}

private struct FlightDeckPullRequest: Identifiable, Hashable {
    let server: Server
    let pullRequest: AuthoredPullRequest

    var id: String { pullRequest.url }
    var deviceCode: String { server.flightDeckCode }
}

private struct FlightDeckArchive: Identifiable {
    let server: Server
    let archive: ArchivedChat

    var id: String { "\(server.id)|\(archive.id)" }
    var deviceCode: String { server.flightDeckCode }
}

private extension Server {
    var flightDeckCode: String {
        if let custom = deviceID?.trimmingCharacters(in: .whitespacesAndNewlines), !custom.isEmpty {
            return String(custom.prefix(8)).uppercased()
        }
        let components = name.split(whereSeparator: { !$0.isLetter && !$0.isNumber })
        if components.count > 1 {
            return components.compactMap(\.first).prefix(4).map(String.init).joined().uppercased()
        }
        return String(name.prefix(5)).uppercased()
    }
}

@MainActor
private final class FlightDeckStore: ObservableObject {
    @Published private(set) var agents: [FlightDeckAgent] = []
    @Published private(set) var workspaces: [FlightDeckWorkspace] = []
    @Published private(set) var loops: [FlightDeckLoop] = []
    @Published private(set) var pullRequests: [FlightDeckPullRequest] = []
    @Published private(set) var archives: [FlightDeckArchive] = []
    @Published private(set) var errors: [String: String] = [:]
    @Published private(set) var checkedServerIDs: Set<String> = []
    @Published private(set) var loading = false
    private var refreshGeneration = 0

    func refresh(refreshPullRequests: Bool = false) async {
        refreshGeneration += 1
        let generation = refreshGeneration
        let servers = ServerStore.shared.servers
        guard !servers.isEmpty else {
            agents = []
            workspaces = []
            loops = []
            pullRequests = []
            archives = []
            errors = [:]
            checkedServerIDs = []
            return
        }

        loading = agents.isEmpty
        let fetches = servers.map { server in
            Task { () -> (Server, [TmuxSession], [Workspace], [MissionLoop], [ArchivedChat], [AuthoredPullRequest], String?) in
                guard let api = APIClient(urlString: server.url, token: server.token) else {
                    return (server, [], [], [], [], [], "Invalid connection")
                }
                do {
                    async let sessionsCall = api.sessions()
                    async let workspacesCall = api.workspaces()
                    let sessions = try await sessionsCall
                    let workspaces = try await workspacesCall
                    // Older servers remain usable during rollout; they simply
                    // contribute no loops until updated.
                    let loops = (try? await api.loops()) ?? []
                    let archives = (try? await api.archives()) ?? []
                    let pullRequests = (try? await api.authoredPullRequests(refresh: refreshPullRequests)) ?? []
                    return (server, sessions, workspaces, loops, archives, pullRequests, nil)
                } catch {
                    return (server, [], [], [], [], [], error.localizedDescription)
                }
            }
        }

        var nextAgents: [FlightDeckAgent] = []
        var nextWorkspaces: [FlightDeckWorkspace] = []
        var nextLoops: [FlightDeckLoop] = []
        var nextArchives: [FlightDeckArchive] = []
        var nextPullRequests: [FlightDeckPullRequest] = []
        var nextErrors: [String: String] = [:]
        for fetch in fetches {
            let (server, sessions, fetchedWorkspaces, fetchedLoops, fetchedArchives, fetchedPullRequests, error) = await fetch.value
            nextAgents += sessions.map { FlightDeckAgent(server: server, session: $0) }
            nextWorkspaces += fetchedWorkspaces.map { FlightDeckWorkspace(server: server, workspace: $0) }
            nextLoops += fetchedLoops.map { FlightDeckLoop(server: server, loop: $0) }
            nextArchives += fetchedArchives.map { FlightDeckArchive(server: server, archive: $0) }
            nextPullRequests += fetchedPullRequests.map { FlightDeckPullRequest(server: server, pullRequest: $0) }
            if let error { nextErrors[server.id] = error }
        }

        guard generation == refreshGeneration else { return }

        agents = nextAgents.sorted(by: Self.triageOrder)
        workspaces = nextWorkspaces.sorted {
            $0.workspace.name.localizedCaseInsensitiveCompare($1.workspace.name) == .orderedAscending
        }
        loops = nextLoops.sorted { $0.loop.nextRunAt < $1.loop.nextRunAt }
        pullRequests = Self.deduplicatedPullRequests(nextPullRequests)
        archives = nextArchives.sorted { $0.archive.archivedAt > $1.archive.archivedAt }
        errors = nextErrors
        checkedServerIDs = Set(servers.map(\.id))
        loading = false
    }

    private static func deduplicatedPullRequests(_ pullRequests: [FlightDeckPullRequest]) -> [FlightDeckPullRequest] {
        var byURL: [String: FlightDeckPullRequest] = [:]
        for pullRequest in pullRequests {
            let existing = byURL[pullRequest.id]
            if existing == nil || (existing?.pullRequest.worktreePath == nil && pullRequest.pullRequest.worktreePath != nil) {
                byURL[pullRequest.id] = pullRequest
            }
        }
        return byURL.values.sorted { $0.pullRequest.updatedAt > $1.pullRequest.updatedAt }
    }

    private static func triageOrder(_ lhs: FlightDeckAgent, _ rhs: FlightDeckAgent) -> Bool {
        func rank(_ state: SessionState) -> Int {
            switch state {
            case .needsInput: return 0
            case .working: return 1
            case .idle: return 2
            case .unknown: return 3
            }
        }
        let leftRank = rank(lhs.session.resolvedState)
        let rightRank = rank(rhs.session.resolvedState)
        if leftRank != rightRank { return leftRank < rightRank }
        return lhs.session.lastOutputAt > rhs.session.lastOutputAt
    }
}

private enum FlightDeckSection: String, CaseIterable, Identifiable {
    case inbox
    case commandCenter
    case workspaces
    case pullRequests
    case loops

    var id: String { rawValue }
    var title: String {
        switch self {
        case .inbox: return "Inbox"
        case .commandCenter: return "Command center"
        case .workspaces: return "Workspaces"
        case .pullRequests: return "Pull requests"
        case .loops: return "Loops"
        }
    }
    var code: String {
        switch self {
        case .inbox: return "IN"
        case .commandCenter: return "CC"
        case .workspaces: return "WS"
        case .pullRequests: return "PR"
        case .loops: return "LP"
        }
    }
}

@MainActor
private final class PullRequestAttentionStore: ObservableObject {
    @Published private var revision = 0
    private var seenActivity: [String: String]
    private var snoozedUntil: [String: TimeInterval]
    private let seenKey = "flightDeckPullRequestSeenActivity"
    private let snoozeKey = "flightDeckPullRequestSnoozedUntil"

    init() {
        seenActivity = Self.decode([String: String].self, key: seenKey) ?? [:]
        snoozedUntil = Self.decode([String: TimeInterval].self, key: snoozeKey) ?? [:]
    }

    func needsAttention(_ item: FlightDeckPullRequest, now: Date = Date()) -> Bool {
        if let until = snoozedUntil[item.id], until > now.timeIntervalSince1970 { return false }
        let pullRequest = item.pullRequest
        let unseenActivity = pullRequest.hasUnreadActivity && seenActivity[item.id] != activityKey(for: pullRequest)
        return pullRequest.failedCheckCount > 0 || unseenActivity
    }

    func markViewed(_ item: FlightDeckPullRequest) {
        seenActivity[item.id] = activityKey(for: item.pullRequest)
        persist()
    }

    func snooze(_ item: FlightDeckPullRequest, until: Date) {
        snoozedUntil[item.id] = until.timeIntervalSince1970
        persist()
    }

    private func activityKey(for pullRequest: AuthoredPullRequest) -> String {
        pullRequest.latestCommentAt ?? pullRequest.updatedAt
    }

    private func persist() {
        let defaults = UserDefaults.standard
        defaults.set(try? JSONEncoder().encode(seenActivity), forKey: seenKey)
        defaults.set(try? JSONEncoder().encode(snoozedUntil), forKey: snoozeKey)
        revision += 1
    }

    private static func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }
}

struct FlightDeckView: View {
    @StateObject private var deck = FlightDeckStore()
    @StateObject private var pullRequestAttention = PullRequestAttentionStore()
    @ObservedObject private var servers = ServerStore.shared
    @ObservedObject private var inbox = InboxStore.shared
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toasts: ToastCenter

    @State private var section: FlightDeckSection = .commandCenter
    @State private var scopeServerID: String?
    @State private var selectedAgentID: String?
    @State private var selectedWorkspaceID: String?
    @State private var selectedLoopID: String?
    @State private var selectedPullRequestID: String?
    @State private var selectedInboxItemID: String?
    @State private var selectedArchiveID: String?
    @State private var showingArchives = false
    @State private var showConnections = false
    @State private var showCommandPalette = false
    @State private var workspaceShellStarting = false
    @State private var deviceMenuOpen = false
    @State private var connectionsAddRequest = 0
    @State private var markingPullRequestIDs: Set<String> = []

    private var visibleAgents: [FlightDeckAgent] {
        guard let scopeServerID else { return deck.agents }
        return deck.agents.filter { $0.server.id == scopeServerID }
    }

    private var visibleWorkspaces: [FlightDeckWorkspace] {
        guard let scopeServerID else { return deck.workspaces }
        return deck.workspaces.filter { $0.server.id == scopeServerID }
    }

    private var selectedAgent: FlightDeckAgent? {
        visibleAgents.first { $0.id == selectedAgentID } ?? visibleAgents.first
    }

    private var selectedWorkspace: FlightDeckWorkspace? {
        visibleWorkspaces.first { $0.id == selectedWorkspaceID } ?? visibleWorkspaces.first
    }

    private var visibleLoops: [FlightDeckLoop] {
        guard let scopeServerID else { return deck.loops }
        return deck.loops.filter { $0.server.id == scopeServerID }
    }

    private var selectedLoop: FlightDeckLoop? {
        visibleLoops.first { $0.id == selectedLoopID } ?? visibleLoops.first
    }

    private var visiblePullRequests: [FlightDeckPullRequest] {
        guard let scopeServerID else { return deck.pullRequests }
        return deck.pullRequests.filter { $0.server.id == scopeServerID }
    }

    private var selectedPullRequest: FlightDeckPullRequest? {
        visiblePullRequests.first { $0.id == selectedPullRequestID } ?? visiblePullRequests.first
    }

    private var visibleAttentionPullRequests: [FlightDeckPullRequest] {
        visiblePullRequests.filter { pullRequestAttention.needsAttention($0) }
    }

    private var visibleArchives: [FlightDeckArchive] {
        guard let scopeServerID else { return deck.archives }
        return deck.archives.filter { $0.server.id == scopeServerID }
    }

    private var selectedArchive: FlightDeckArchive? {
        visibleArchives.first { $0.id == selectedArchiveID } ?? visibleArchives.first
    }

    private var onlineDeviceCount: Int {
        max(servers.servers.count - deck.errors.count, 0)
    }

    var body: some View {
        GeometryReader { geometry in
            let adaptiveSidebarWidth = max(216, min(340, geometry.size.width * 0.15))
            let adaptiveInspectorWidth = max(360, min(560, geometry.size.width * 0.25))
            VStack(spacing: 0) {
                titleBar
                HStack(spacing: 0) {
                    navigation(sidebarWidth: adaptiveSidebarWidth)
                        .frame(width: adaptiveSidebarWidth)
                    sectionContent(inspectorWidth: adaptiveInspectorWidth)
                }
            }
        }
        .font(.flightSans(12))
        .foregroundStyle(FlightDeckPalette.text)
        .background(FlightDeckPalette.background)
        // Catalyst normally reserves a second blank titlebar row above the
        // SwiftUI scene. The Flight Deck strip is the titlebar, so let it occupy
        // that safe area beneath the native traffic-light controls.
        .ignoresSafeArea(.container, edges: .top)
        .preferredColorScheme(.dark)
        .task { await pollFleet() }
        .onReceive(PushChannel.shared.sessionListChanges) { _ in
            Task { await deck.refresh(); normalizeSelection() }
        }
        .onChange(of: servers.servers) { _, _ in
            Task { await deck.refresh(); normalizeSelection() }
        }
        .onChange(of: scopeServerID) { _, _ in normalizeSelection() }
        .onChange(of: deck.agents) { _, _ in normalizeSelection() }
        .onChange(of: router.openSession) { _, sessionName in
            guard let sessionName,
                  let agent = deck.agents.first(where: { $0.session.name == sessionName }) else { return }
            select(agent)
            router.openSession = nil
        }
        .onChange(of: router.isCommandPalettePresented) { _, presented in
            if presented {
                router.isCommandPalettePresented = false
                showCommandPalette = true
            }
        }
        .onChange(of: router.isInboxPresented) { _, presented in
            if presented {
                router.isInboxPresented = false
                section = .inbox
            }
        }
        .overlay {
            if showCommandPalette {
                FlightDeckModalLayer(onDismiss: { showCommandPalette = false }) {
                    FlightDeckCommandPaletteModal(
                        sessions: visibleAgents.map(\.session),
                        onCancel: { showCommandPalette = false },
                        onOpen: { name in
                            showCommandPalette = false
                            if let agent = visibleAgents.first(where: { $0.session.name == name }) { select(agent) }
                        },
                        onManageServers: {
                            showCommandPalette = false
                            showConnections = true
                        }
                    )
                }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            ToastOverlay().padding(20)
        }
    }

    private var titleBar: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: 280)

            Text("MISSION CONTROL // LIVE OPERATIONS")
                .font(.flightMono(10, weight: .bold))
                .tracking(1.2)
                .frame(maxWidth: .infinity)

            HStack(spacing: 10) {
                Circle()
                    .fill(onlineDeviceCount > 0 ? FlightDeckPalette.green : FlightDeckPalette.muted)
                    .frame(width: 7, height: 7)
                Text("\(onlineDeviceCount) DEVICE\(onlineDeviceCount == 1 ? "" : "S") ONLINE")
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(context.date.formatted(date: .omitted, time: .standard))
                        .foregroundStyle(FlightDeckPalette.muted)
                }
            }
            .font(.flightMono(9))
            .foregroundStyle(FlightDeckPalette.secondary)
            .frame(width: 280, alignment: .trailing)
            .lineLimit(1)
            .padding(.trailing, 18)
        }
        .frame(height: 52)
        .background(FlightDeckPalette.sidebar)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            NotificationCenter.default.post(name: .flightDeckTitleBarDoubleClicked, object: nil)
        }
    }

    private func navigation(sidebarWidth: CGFloat) -> some View {
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                flightLabel("DEVICE VIEW")
                deviceMenu
            }
            .padding(.horizontal, 14)
            .padding(.top, 28)
            .padding(.bottom, 26)

            VStack(spacing: 4) {
                ForEach(FlightDeckSection.allCases) { destination in
                    navigationRow(destination)
                }
            }
            .padding(.horizontal, 14)

            Divider().overlay(FlightDeckPalette.border).padding(.horizontal, 14).padding(.vertical, 16)

            HStack {
                flightLabel("AGENTS")
                Spacer()
                Text(String(format: "%02d", visibleAgents.count))
                    .font(.flightMono(8))
                    .foregroundStyle(FlightDeckPalette.muted)
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 8)

            ScrollView {
                LazyVStack(spacing: 3) {
                    ForEach(visibleAgents) { agent in
                        sidebarAgent(agent)
                    }
                }
                .padding(.horizontal, 14)
            }

            Spacer(minLength: 12)
            Divider().overlay(FlightDeckPalette.border).padding(.horizontal, 14)
            VStack(spacing: 2) {
                utilityRow("AR", "Archived chats") {
                    showConnections = false
                    showingArchives = true
                }
                utilityRow("⌘K", "Quick open") { showCommandPalette = true }
                utilityRow("CF", "Connection settings") {
                    showingArchives = false
                    showConnections = true
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
        }
        .background(FlightDeckPalette.sidebar)
        .overlay(alignment: .trailing) {
            Rectangle().fill(FlightDeckPalette.border).frame(width: 1)
        }
    }

    @ViewBuilder
    private var deviceMenu: some View {
        if servers.servers.isEmpty {
            Button(action: openConnectionSetup) {
                HStack(spacing: 14) {
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.amber)
                        .frame(width: 30, height: 30)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(FlightDeckPalette.amber))
                    VStack(alignment: .leading, spacing: 5) {
                        Text("ADD CONNECTION")
                            .font(.flightMono(9, weight: .bold))
                            .foregroundStyle(FlightDeckPalette.amber)
                        Text("PAIR THIS MAC OR ANOTHER DEVICE")
                            .font(.flightMono(7))
                            .foregroundStyle(FlightDeckPalette.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.amber)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .frame(maxWidth: .infinity, minHeight: 66)
                .background(FlightDeckPalette.raised)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(FlightDeckPalette.amber))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            VStack(spacing: 8) {
            Button { deviceMenuOpen.toggle() } label: {
                HStack(spacing: 14) {
                    Circle().fill(scopeStatusColor).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(scopeTitle)
                            .font(.flightSans(11, weight: .semibold))
                            .foregroundStyle(FlightDeckPalette.text)
                            .lineLimit(1)
                        Text(scopeSubtitle)
                            .font(.flightMono(7))
                            .foregroundStyle(FlightDeckPalette.muted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: deviceMenuOpen ? "chevron.up" : "chevron.down")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(deviceMenuOpen ? FlightDeckPalette.amber : FlightDeckPalette.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 66)
                .background(FlightDeckPalette.surface)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(deviceMenuOpen ? FlightDeckPalette.amber : FlightDeckPalette.strongBorder)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if deviceMenuOpen {
                VStack(spacing: 0) {
                    deviceScopeRow(server: nil)
                    ForEach(servers.servers) { server in
                        Divider().overlay(FlightDeckPalette.border)
                        deviceScopeRow(server: server)
                    }
                    Divider().overlay(FlightDeckPalette.border)
                    Button(action: openConnectionSetup) {
                        Text("+ ADD CONNECTION")
                            .font(.flightMono(8, weight: .medium))
                            .foregroundStyle(FlightDeckPalette.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .frame(height: 46)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .background(FlightDeckPalette.surface)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }
            }
        }
    }

    private func openConnectionSetup() {
        deviceMenuOpen = false
        showingArchives = false
        showConnections = true
        connectionsAddRequest += 1
    }

    private func deviceScopeRow(server: Server?) -> some View {
        let selected = server?.id == scopeServerID || (server == nil && scopeServerID == nil)
        let agents = server.map { target in deck.agents.filter { $0.server.id == target.id }.count } ?? deck.agents.count
        let subtitle = server.map {
            "\($0.flightDeckCode) · \(agents) AGENT\(agents == 1 ? "" : "S")"
        } ?? "\(servers.servers.count) DEVICE\(servers.servers.count == 1 ? "" : "S") · \(agents) AGENT\(agents == 1 ? "" : "S")"
        return Button {
            scopeServerID = server?.id
            if let server { servers.activeID = server.id }
            deviceMenuOpen = false
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(server.map { deck.errors[$0.id] == nil ? FlightDeckPalette.green : FlightDeckPalette.red } ?? scopeStatusColor)
                    .frame(width: 7, height: 7)
                VStack(alignment: .leading, spacing: 2) {
                    Text(server?.name ?? "All devices")
                        .font(.flightSans(10, weight: selected ? .semibold : .regular))
                        .foregroundStyle(selected ? FlightDeckPalette.text : FlightDeckPalette.secondary)
                        .lineLimit(1)
                    if server != nil {
                        Text(subtitle)
                            .font(.flightMono(7))
                            .foregroundStyle(FlightDeckPalette.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                if selected {
                    Text("✓")
                        .font(.flightMono(9, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.amber)
                }
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .frame(height: server == nil ? 46 : 54)
            .background(selected ? FlightDeckPalette.raised : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var scopeStatusColor: Color {
        onlineDeviceCount > 0 ? FlightDeckPalette.green : FlightDeckPalette.muted
    }

    private var scopeTitle: String {
        guard let scopeServerID,
              let server = servers.servers.first(where: { $0.id == scopeServerID }) else { return "All devices" }
        return server.name
    }

    private var scopeSubtitle: String {
        if scopeServerID == nil {
            let deviceCount = servers.servers.count
            let agentCount = visibleAgents.count
            return "\(deviceCount) DEVICE\(deviceCount == 1 ? "" : "S") · \(agentCount) AGENT\(agentCount == 1 ? "" : "S")"
        }
        let agentCount = visibleAgents.count
        let workspaceCount = visibleWorkspaces.count
        return "\(agentCount) AGENT\(agentCount == 1 ? "" : "S") · \(workspaceCount) WORKSPACE\(workspaceCount == 1 ? "" : "S")"
    }

    private func navigationRow(_ destination: FlightDeckSection) -> some View {
        let selected = !showingArchives && !showConnections && section == destination
        return Button {
            section = destination
            showingArchives = false
            showConnections = false
            deviceMenuOpen = false
        } label: {
            HStack(spacing: 0) {
                Text(destination.code)
                    .font(.flightMono(7, weight: .medium))
                    .foregroundStyle(selected ? FlightDeckPalette.amber : FlightDeckPalette.muted)
                    .frame(width: 28, alignment: .leading)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                Text(destination.title)
                    .font(.flightSans(11, weight: selected ? .semibold : .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Spacer()
                let attentionCount = inbox.count + visibleAttentionPullRequests.count
                if destination == .inbox, attentionCount > 0 {
                    Text("\(attentionCount)")
                        .font(.flightMono(9, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.onAccent)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(FlightDeckPalette.amber)
                }
            }
            .foregroundStyle(selected ? FlightDeckPalette.text : FlightDeckPalette.secondary)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(selected ? FlightDeckPalette.raised : Color.clear)
            .overlay(alignment: .leading) {
                if selected { Rectangle().fill(FlightDeckPalette.amber).frame(width: 3) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
    }

    private func sidebarAgent(_ agent: FlightDeckAgent) -> some View {
        let selected = selectedAgent?.id == agent.id
        return Button {
            select(agent)
        } label: {
            HStack(spacing: 10) {
                Rectangle()
                    .fill(stateColor(agent.session.resolvedState))
                    .frame(width: 7, height: 7)
                VStack(alignment: .leading, spacing: 4) {
                    Text(agent.session.name)
                        .font(.flightSans(9, weight: selected ? .semibold : .regular))
                        .lineLimit(1)
                    Text("\((agent.session.agent ?? .shell).displayName.uppercased()) · \(workspaceCode(for: agent))")
                        .font(.flightMono(6))
                        .foregroundStyle(FlightDeckPalette.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(agent.deviceCode)
                    .font(.flightMono(7))
                    .foregroundStyle(agent.session.resolvedState == .working ? FlightDeckPalette.green : FlightDeckPalette.secondary)
            }
            .foregroundStyle(selected ? FlightDeckPalette.text : FlightDeckPalette.secondary)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)
            .frame(height: 43)
            .background(selected ? FlightDeckPalette.raised : FlightDeckPalette.surface.opacity(0.72))
            .overlay(alignment: .leading) {
                if selected { Rectangle().fill(FlightDeckPalette.amber).frame(width: 3) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
    }

    private func utilityRow(_ code: String, _ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(code).font(.flightMono(7)).frame(width: 22).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                Text(title).font(.flightSans(10)).lineLimit(1).minimumScaleFactor(0.85)
                Spacer()
            }
            .foregroundStyle(FlightDeckPalette.secondary)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)
            .frame(height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func sectionContent(inspectorWidth: CGFloat) -> some View {
        if showConnections {
            FlightDeckConnectionsView(
                addRequest: connectionsAddRequest,
                serverErrors: deck.errors,
                checkedServerIDs: deck.checkedServerIDs
            )
        } else if showingArchives {
            archivesView
        } else {
            switch section {
            case .inbox:
                inboxView(inspectorWidth: inspectorWidth)
            case .commandCenter:
                commandCenter(inboxOnly: false, inspectorWidth: inspectorWidth)
            case .workspaces:
                workspacesView
            case .pullRequests:
                pullRequestsView
            case .loops:
                loopsView
            }
        }
    }

    private func commandCenter(inboxOnly: Bool, inspectorWidth: CGFloat) -> some View {
        let inboxIDs = Set(inbox.items.map(\.id))
        let agents = inboxOnly
            ? visibleAgents.filter { inboxIDs.contains($0.id) }
            : visibleAgents
        let focusedAgent = agents.first { $0.id == selectedAgentID } ?? agents.first
        return HStack(spacing: 0) {
            FlightDeckQueue(
                title: inboxOnly ? "Inbox" : "\(visibleAgents.count) live agent\(visibleAgents.count == 1 ? "" : "s")",
                eyebrow: inboxOnly ? "ALL DEVICES / ATTENTION" : "ALL DEVICES / ATTENTION",
                agents: agents,
                workspaces: visibleWorkspaces,
                launchDevices: scopeServerID == nil
                    ? servers.servers
                    : servers.servers.filter { $0.id == scopeServerID },
                requiresDeviceSelection: scopeServerID == nil,
                selectedID: focusedAgent?.id,
                onSelect: { select($0, preservingSection: inboxOnly) },
                onNewSession: launchRootShell,
                onNewShell: openShell,
                onSnooze: inboxOnly ? { agent, date in
                    inbox.snooze(serverID: agent.server.id, session: agent.session.name, until: date)
                    toasts.show(.info, "Snoozed \(agent.session.name)")
                } : nil
            )
            .frame(width: FlightDeckLayout.indexWidth)
            .overlay(alignment: .leading) {
                Rectangle().fill(FlightDeckPalette.border).frame(width: 1)
            }
            .overlay(alignment: .trailing) {
                Rectangle().fill(FlightDeckPalette.border).frame(width: 1)
            }

            if let focusedAgent {
                TerminalScreen(
                    sessionName: focusedAgent.session.name,
                    flightPresentation: FlightDeckSessionPresentation(
                        agent: focusedAgent.session.agent ?? .shell,
                        state: focusedAgent.session.resolvedState,
                        panePath: focusedAgent.session.panePath,
                        paneCommand: focusedAgent.session.paneCommand,
                        currentAction: focusedAgent.session.currentAction,
                        context: focusedAgent.session.context
                    )
                )
                    .id(focusedAgent.id)
                    .frame(minWidth: 520, maxWidth: .infinity)
                    .background(FlightDeckPalette.background)
                FlightDeckTelemetry(agent: focusedAgent)
                    .frame(width: inspectorWidth)
            } else {
                FlightDeckEmptyState(
                    title: inboxOnly ? "Inbox clear" : "No live agents",
                    detail: inboxOnly ? "Nothing needs your attention right now." : "Launch a shell to start operating."
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(FlightDeckPalette.background)
    }

    private func inboxView(inspectorWidth: CGFloat) -> some View {
        let inboxIDs = Set(inbox.items.map(\.id))
        let agents = visibleAgents.filter { inboxIDs.contains($0.id) }
        let attentionPullRequests = visibleAttentionPullRequests
        let selectedPullRequest = selectedInboxItemID
            .flatMap { selectedID in visiblePullRequests.first { "pr|\($0.id)" == selectedID } }
        let pullRequests: [FlightDeckPullRequest]
        if let selectedPullRequest, !attentionPullRequests.contains(where: { $0.id == selectedPullRequest.id }) {
            pullRequests = [selectedPullRequest] + attentionPullRequests
        } else {
            pullRequests = attentionPullRequests
        }
        let validIDs = Set(agents.map { "agent|\($0.id)" } + pullRequests.map { "pr|\($0.id)" })
        let focusedID = selectedInboxItemID.flatMap { validIDs.contains($0) ? $0 : nil }
            ?? pullRequests.first.map { "pr|\($0.id)" }
            ?? agents.first.map { "agent|\($0.id)" }

        return HStack(spacing: 0) {
            FlightDeckInboxQueue(
                agents: agents,
                pullRequests: pullRequests,
                workspaces: visibleWorkspaces,
                selectedID: focusedID,
                onSelectAgent: { selectedInboxItemID = "agent|\($0.id)" },
                onSelectPullRequest: { selectedInboxItemID = "pr|\($0.id)" },
                onSnoozeAgent: { agent, date in
                    inbox.snooze(serverID: agent.server.id, session: agent.session.name, until: date)
                },
                onSnoozePullRequest: { pullRequest, date in
                    pullRequestAttention.snooze(pullRequest, until: date)
                }
            )
            .frame(width: FlightDeckLayout.indexWidth)

            if let pullRequest = pullRequests.first(where: { "pr|\($0.id)" == focusedID }) {
                FlightDeckInboxPullRequestDetail(
                    item: pullRequest,
                    agent: matchingAgent(for: pullRequest),
                    onOpenSession: { openSession(for: pullRequest) },
                    onLaunchShell: { launchShell(for: pullRequest) },
                    onViewed: { viewPullRequest(pullRequest) },
                    onSnooze: { pullRequestAttention.snooze(pullRequest, until: Date().addingTimeInterval(3600)) },
                    onOpenTerminal: { openSession(for: pullRequest) }
                )
            } else if let agent = agents.first(where: { "agent|\($0.id)" == focusedID }) {
                TerminalScreen(
                    sessionName: agent.session.name,
                    flightPresentation: FlightDeckSessionPresentation(
                        agent: agent.session.agent ?? .shell,
                        state: agent.session.resolvedState,
                        panePath: agent.session.panePath,
                        paneCommand: agent.session.paneCommand,
                        currentAction: agent.session.currentAction,
                        context: agent.session.context
                    )
                )
                .id(agent.id)
                .frame(minWidth: 520, maxWidth: .infinity)
                FlightDeckTelemetry(agent: agent)
                    .frame(width: inspectorWidth)
            } else {
                FlightDeckEmptyState(title: "Inbox clear", detail: "Nothing needs your attention right now.")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(FlightDeckPalette.background)
    }

    private var workspacesView: some View {
        FlightDeckWorkspacesView(
            workspaces: visibleWorkspaces,
            agents: visibleAgents,
            selectedID: selectedWorkspace?.id,
            onSelect: { selectedWorkspaceID = $0.id },
            onAddFromShell: startWorkspaceShell,
            onOpenShell: openShell,
            onChanged: { await deck.refresh() }
        )
    }

    private var loopsView: some View {
        FlightDeckLoopsView(
            loops: visibleLoops,
            workspaces: visibleWorkspaces,
            selectedID: selectedLoop?.id,
            onSelect: { selectedLoopID = $0.id },
            onChanged: { await deck.refresh() },
            onOpenSession: { server, session in
                await deck.refresh()
                if let agent = deck.agents.first(where: { $0.server.id == server.id && $0.session.name == session }) {
                    select(agent)
                }
            }
        )
    }

    private var pullRequestsView: some View {
        FlightDeckPullRequestsView(
            pullRequests: visiblePullRequests,
            agents: visibleAgents,
            workspaces: visibleWorkspaces,
            selectedID: selectedPullRequest?.id,
            onSelect: {
                selectedPullRequestID = $0.id
                viewPullRequest($0)
            },
            onViewed: { viewPullRequest($0) },
            onOpenSession: { openSession(for: $0) },
            onLaunchShell: { launchShell(for: $0) },
            onRefresh: { Task { await deck.refresh(refreshPullRequests: true) } }
        )
    }

    private var archivesView: some View {
        FlightDeckArchivesView(
            archives: visibleArchives,
            selectedID: selectedArchive?.id,
            onSelect: { selectedArchiveID = $0.id },
            onChanged: { await deck.refresh() }
        )
    }

    private func pollFleet() async {
        while !Task.isCancelled {
            await deck.refresh()
            normalizeSelection()
            try? await Task.sleep(for: .seconds(5))
        }
    }

    private func normalizeSelection() {
        if selectedAgent == nil { selectedAgentID = visibleAgents.first?.id }
        if selectedWorkspace == nil { selectedWorkspaceID = visibleWorkspaces.first?.id }
        if selectedLoop == nil { selectedLoopID = visibleLoops.first?.id }
        if selectedPullRequest == nil { selectedPullRequestID = visiblePullRequests.first?.id }
        if selectedArchive == nil { selectedArchiveID = visibleArchives.first?.id }
    }

    private func select(_ agent: FlightDeckAgent) {
        select(agent, preservingSection: false)
    }

    private func select(_ agent: FlightDeckAgent, preservingSection: Bool) {
        servers.activeID = agent.server.id
        selectedAgentID = agent.id
        showingArchives = false
        showConnections = false
        if !preservingSection { section = .commandCenter }
    }

    private func matchingAgent(for pullRequest: FlightDeckPullRequest) -> FlightDeckAgent? {
        pullRequestMatchingAgent(for: pullRequest, agents: deck.agents, workspaces: deck.workspaces)
    }

    private func openSession(for pullRequest: FlightDeckPullRequest) {
        guard let agent = matchingAgent(for: pullRequest) else { return }
        pullRequestAttention.markViewed(pullRequest)
        select(agent)
    }

    private func launchShell(for pullRequest: FlightDeckPullRequest) {
        guard let workspace = deck.workspaces.first(where: {
            $0.server.id == pullRequest.server.id && $0.workspace.id == pullRequest.pullRequest.workspaceId
        }) else { return }
        pullRequestAttention.markViewed(pullRequest)
        servers.activeID = workspace.server.id
        Task {
            guard let api = APIClient(urlString: workspace.server.url, token: workspace.server.token) else { return }
            do {
                let name = try await api.openPullRequestSession(
                    workspaceID: workspace.workspace.id,
                    branch: pullRequest.pullRequest.headRefName,
                    number: pullRequest.pullRequest.number
                )
                await deck.refresh()
                if let agent = deck.agents.first(where: { $0.server.id == workspace.server.id && $0.session.name == name }) {
                    select(agent)
                }
            } catch {
                toasts.show(.error, "Couldn't launch PR shell: \(error.localizedDescription)")
            }
        }
    }

    private func viewPullRequest(_ pullRequest: FlightDeckPullRequest) {
        guard pullRequest.pullRequest.hasUnreadActivity else {
            pullRequestAttention.markViewed(pullRequest)
            return
        }
        guard !markingPullRequestIDs.contains(pullRequest.id) else { return }
        guard let api = APIClient(urlString: pullRequest.server.url, token: pullRequest.server.token) else { return }
        markingPullRequestIDs.insert(pullRequest.id)
        Task {
            defer { markingPullRequestIDs.remove(pullRequest.id) }
            do {
                try await api.markPullRequestRead(
                    repository: pullRequest.pullRequest.repository,
                    number: pullRequest.pullRequest.number
                )
                pullRequestAttention.markViewed(pullRequest)
                await deck.refresh(refreshPullRequests: true)
            } catch {
                toasts.show(.error, "Couldn't sync GitHub read state: \(error.localizedDescription)")
            }
        }
    }

    private func openShell(_ workspace: FlightDeckWorkspace, _ path: String?) {
        servers.activeID = workspace.server.id
        Task {
            guard let api = APIClient(urlString: workspace.server.url, token: workspace.server.token) else { return }
            do {
                let name = try await api.createSession(name: nil, path: path ?? workspace.workspace.path, agent: .shell)
                await deck.refresh()
                if let agent = deck.agents.first(where: { $0.server.id == workspace.server.id && $0.session.name == name }) {
                    select(agent)
                }
            } catch {
                toasts.show(.error, "Couldn't launch shell: \(error.localizedDescription)")
            }
        }
    }

    private func startWorkspaceShell() {
        guard !workspaceShellStarting else { return }
        let server = scopeServerID.flatMap { id in servers.servers.first(where: { $0.id == id }) } ?? servers.active ?? servers.servers.first
        guard let server, let api = APIClient(urlString: server.url, token: server.token) else {
            showConnections = true
            return
        }
        workspaceShellStarting = true
        Task {
            defer { workspaceShellStarting = false }
            do {
                let name = try await api.createSession(name: nil, path: nil, agent: .shell)
                await deck.refresh()
                if let agent = deck.agents.first(where: { $0.server.id == server.id && $0.session.name == name }) {
                    select(agent)
                    toasts.show(.info, "cd into a repository, then choose Save repository as workspace")
                }
            } catch {
                toasts.show(.error, "Couldn't launch workspace shell")
            }
        }
    }

    private func launchRootShell(on server: Server) {
        guard let api = APIClient(urlString: server.url, token: server.token) else {
            showConnections = true
            connectionsAddRequest += 1
            return
        }
        servers.activeID = server.id
        Task {
            do {
                let name = try await api.createSession(name: nil, path: nil, agent: .shell)
                await deck.refresh()
                if let agent = deck.agents.first(where: { $0.server.id == server.id && $0.session.name == name }) {
                    select(agent)
                }
            } catch {
                toasts.show(.error, "Couldn't launch shell: \(error.localizedDescription)")
            }
        }
    }

    private func workspaceCode(for agent: FlightDeckAgent) -> String {
        let match = deck.workspaces.first { candidate in
            candidate.server.id == agent.server.id && candidate.workspace.worktrees.contains { worktree in
                agent.session.panePath == worktree.path || agent.session.panePath.hasPrefix(worktree.path + "/")
            }
        }
        return match?.workspace.name.uppercased() ?? "SHELL"
    }
}

private struct FlightDeckCommandPaletteModal: View {
    let sessions: [TmuxSession]
    let onCancel: () -> Void
    let onOpen: (String) -> Void
    let onManageServers: () -> Void

    @State private var query = ""

    private var matches: [TmuxSession] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidates = term.isEmpty ? sessions : sessions.filter {
            $0.name.localizedCaseInsensitiveContains(term)
                || $0.panePath.localizedCaseInsensitiveContains(term)
                || $0.paneCommand.localizedCaseInsensitiveContains(term)
        }
        return candidates.sorted {
            rank($0.resolvedState) != rank($1.resolvedState)
                ? rank($0.resolvedState) < rank($1.resolvedState)
                : $0.lastOutputAt > $1.lastOutputAt
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            FlightDeckModalHeader(
                eyebrow: "COMMAND CENTER / QUICK OPEN",
                title: "Find an agent",
                onCancel: onCancel
            )

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(FlightDeckPalette.secondary)
                TextField("Search sessions, folders, commands", text: $query)
                    .textFieldStyle(FlightDeckTextFieldStyle())
                    .onSubmit {
                        if let first = matches.first { onOpen(first.name) }
                    }
            }
            .padding(18)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            ScrollView {
                LazyVStack(spacing: 0) {
                    if matches.isEmpty {
                        Text("NO MATCHING AGENTS")
                            .font(.flightMono(9))
                            .foregroundStyle(FlightDeckPalette.muted)
                            .frame(maxWidth: .infinity, minHeight: 180)
                    } else {
                        ForEach(matches) { session in
                            Button { onOpen(session.name) } label: {
                                HStack(spacing: 12) {
                                    Rectangle()
                                        .fill(stateColor(session.resolvedState))
                                        .frame(width: 8, height: 8)
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(session.name)
                                            .font(.flightSans(14, weight: .semibold))
                                            .foregroundStyle(FlightDeckPalette.text)
                                        Text(session.preview ?? session.panePath)
                                            .font(.flightSans(10))
                                            .foregroundStyle(FlightDeckPalette.secondary)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                    Text(stateLabel(session.resolvedState))
                                        .font(.flightMono(8))
                                        .foregroundStyle(stateColor(session.resolvedState))
                                }
                                .padding(.horizontal, 20)
                                .frame(height: 68)
                            }
                            .flightDeckIndexRow(selected: false)
                        }
                    }
                }
            }
            .frame(height: 310)

            HStack(spacing: 10) {
                Button("MANAGE CONNECTIONS", action: onManageServers)
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                Spacer()
                Text("↵ OPEN FIRST")
                    .font(.flightMono(8))
                    .foregroundStyle(FlightDeckPalette.muted)
            }
            .padding(18)
            .background(FlightDeckPalette.surface)
            .overlay(alignment: .top) { Divider().overlay(FlightDeckPalette.border) }
        }
        .frame(width: 680)
    }

    private func rank(_ state: SessionState) -> Int {
        switch state {
        case .needsInput: return 0
        case .working: return 1
        case .idle: return 2
        case .unknown: return 3
        }
    }
}

private struct FlightDeckQueue: View {
    let title: String
    let eyebrow: String
    let agents: [FlightDeckAgent]
    let workspaces: [FlightDeckWorkspace]
    let launchDevices: [Server]
    let requiresDeviceSelection: Bool
    let selectedID: String?
    let onSelect: (FlightDeckAgent) -> Void
    let onNewSession: (Server) -> Void
    let onNewShell: (FlightDeckWorkspace, String?) -> Void
    let onSnooze: ((FlightDeckAgent, Date) -> Void)?

    @State private var collapsed: Set<String> = []
    @State private var launchDeviceMenuOpen = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    flightLabel(eyebrow)
                    Text(title)
                        .font(.flightSans(26, weight: .bold))
                        .tracking(-0.8)
                }
                Spacer(minLength: 0)
                if let agent = agents.first(where: { $0.id == selectedID }), onSnooze != nil {
                    snoozeMenu(agent)
                }
                Button("+") {
                    if requiresDeviceSelection {
                        launchDeviceMenuOpen.toggle()
                    } else if let device = launchDevices.first {
                        onNewSession(device)
                    }
                }
                    .buttonStyle(FlightDeckSquareButtonStyle())
                    .help(requiresDeviceSelection ? "Choose a device for a root shell" : "Launch a root shell")
            }
            .padding(.horizontal, 22)
            .frame(height: 86)

            HStack(spacing: 0) {
                queueStat(agents.filter { $0.session.resolvedState == .needsInput }.count, "NEED YOU", FlightDeckPalette.amber)
                queueStat(agents.filter { $0.session.resolvedState == .working }.count, "ACTIVE", FlightDeckPalette.secondary)
                queueStat(agents.filter { $0.session.resolvedState == .idle }.count, "IDLE", FlightDeckPalette.secondary)
            }
            .frame(height: 45)
            .padding(.horizontal, 22)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(groupedWorkspaces, id: \.workspace.id) { workspace, groupedAgents in
                        workspaceHeader(workspace, count: groupedAgents.count)
                        if !collapsed.contains(workspace.id) {
                            ForEach(groupedAgents) { agent in agentRow(agent) }
                        }
                    }
                    let ungrouped = agents.filter { workspace(for: $0) == nil }
                    if !ungrouped.isEmpty {
                        HStack {
                            Text("SHELLS").font(.flightMono(9, weight: .semibold))
                            Spacer()
                            Text("\(ungrouped.count)").font(.flightMono(8))
                        }
                        .foregroundStyle(FlightDeckPalette.secondary)
                        .padding(.horizontal, 18)
                        .frame(height: 42)
                        ForEach(ungrouped) { agent in agentRow(agent) }
                    }
                }
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .topTrailing) {
            if launchDeviceMenuOpen {
                launchDeviceMenu
                    .padding(.top, 72)
                    .padding(.trailing, 22)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                    .zIndex(20)
            }
        }
        .onChange(of: requiresDeviceSelection) { _, _ in launchDeviceMenuOpen = false }
        .animation(.easeOut(duration: 0.14), value: launchDeviceMenuOpen)
    }

    private var launchDeviceMenu: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("LAUNCH ROOT SHELL")
                .font(.flightMono(7, weight: .bold))
                .foregroundStyle(FlightDeckPalette.muted)
                .padding(.horizontal, 14)
                .frame(height: 34)

            Divider().overlay(FlightDeckPalette.border)

            if launchDevices.isEmpty {
                Text("NO CONNECTED DEVICES")
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
            } else {
                ForEach(Array(launchDevices.enumerated()), id: \.element.id) { index, device in
                    if index > 0 { Divider().overlay(FlightDeckPalette.border) }
                    Button {
                        launchDeviceMenuOpen = false
                        onNewSession(device)
                    } label: {
                        HStack(spacing: 10) {
                            Circle()
                                .fill(FlightDeckPalette.green)
                                .frame(width: 7, height: 7)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(device.name)
                                    .font(.flightSans(10, weight: .semibold))
                                    .foregroundStyle(FlightDeckPalette.text)
                                    .lineLimit(1)
                                Text(device.flightDeckCode)
                                    .font(.flightMono(7))
                                    .foregroundStyle(FlightDeckPalette.muted)
                            }
                            Spacer(minLength: 12)
                            Text("LAUNCH →")
                                .font(.flightMono(7, weight: .medium))
                                .foregroundStyle(FlightDeckPalette.amber)
                        }
                        .padding(.horizontal, 14)
                        .frame(width: 250, height: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(width: 250)
        .background(FlightDeckPalette.raised)
        .overlay(Rectangle().stroke(FlightDeckPalette.amber.opacity(0.85)))
        .shadow(color: .black.opacity(0.45), radius: 16, y: 8)
    }

    private var groupedWorkspaces: [(workspace: FlightDeckWorkspace, agents: [FlightDeckAgent])] {
        workspaces.map { workspace in
            let matches = agents.filter { agent in
                agent.server.id == workspace.server.id && workspace.workspace.worktrees.contains { worktree in
                    agent.session.panePath == worktree.path || agent.session.panePath.hasPrefix(worktree.path + "/")
                }
            }
            return (workspace, matches)
        }
    }

    private func workspace(for agent: FlightDeckAgent) -> FlightDeckWorkspace? {
        workspaces.first { workspace in
            workspace.server.id == agent.server.id && workspace.workspace.worktrees.contains { worktree in
                agent.session.panePath == worktree.path || agent.session.panePath.hasPrefix(worktree.path + "/")
            }
        }
    }

    private func workspaceHeader(_ workspace: FlightDeckWorkspace, count: Int) -> some View {
        HStack(spacing: 10) {
            Button {
                if collapsed.contains(workspace.id) { collapsed.remove(workspace.id) } else { collapsed.insert(workspace.id) }
            } label: {
                Image(systemName: collapsed.contains(workspace.id) ? "chevron.right" : "chevron.down")
                    .font(.system(size: 7, weight: .bold))
                    .frame(width: 10)
            }
            .buttonStyle(.plain)
            Text(workspace.workspace.name)
                .font(.flightSans(12, weight: .semibold))
            Text(workspace.deviceCode)
                .font(.flightMono(7))
                .foregroundStyle(FlightDeckPalette.muted)
            Spacer()
            Text("\(count) AGENT\(count == 1 ? "" : "S")")
                .font(.flightMono(7))
                .foregroundStyle(FlightDeckPalette.muted)
            Button("+") { onNewShell(workspace, nil) }
                .font(.flightMono(13))
                .foregroundStyle(FlightDeckPalette.amber)
                .frame(width: 24, height: 24)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
                .buttonStyle(.plain)
                .help("Launch a shell in \(workspace.workspace.name)")
        }
        .foregroundStyle(FlightDeckPalette.text)
        .padding(.horizontal, 14)
        .frame(height: 42)
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private func agentRow(_ agent: FlightDeckAgent) -> some View {
        let selected = agent.id == selectedID
        return Button { onSelect(agent) } label: {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 9) {
                    Rectangle().fill(stateColor(agent.session.resolvedState)).frame(width: 8, height: 8)
                    Text(agent.session.name)
                        .font(.flightSans(15, weight: .semibold))
                        .lineLimit(1)
                    Spacer()
                    Text(stateLabel(agent.session.resolvedState))
                        .font(.flightMono(8))
                        .foregroundStyle(stateColor(agent.session.resolvedState))
                }
                Text(agent.session.detail ?? agent.session.currentAction ?? agent.session.preview ?? "Shell ready")
                    .font(.flightSans(11))
                    .foregroundStyle(FlightDeckPalette.secondary)
                    .lineLimit(1)
                HStack {
                    Text("\((agent.session.agent ?? .shell).displayName.uppercased()) / TASK")
                    Spacer()
                    Text(agent.deviceCode)
                }
                .font(.flightMono(7))
                .foregroundStyle(FlightDeckPalette.muted)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(height: 91)
            .foregroundStyle(selected ? FlightDeckPalette.text : FlightDeckPalette.secondary)
        }
        .flightDeckIndexRow(selected: selected)
        .contextMenu {
            if let onSnooze {
                Button("Snooze for 1 hour") {
                    onSnooze(agent, Date().addingTimeInterval(60 * 60))
                }
                Button("Snooze until tomorrow") {
                    let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: Date())
                        ?? Date().addingTimeInterval(24 * 60 * 60)
                    let tomorrowMorning = Calendar.current.startOfDay(for: nextDay)
                        .addingTimeInterval(9 * 60 * 60)
                    onSnooze(agent, tomorrowMorning)
                }
            }
        }
    }

    private func snoozeMenu(_ agent: FlightDeckAgent) -> some View {
        Menu {
            Button("Snooze for 1 hour") { snooze(agent, tomorrow: false) }
            Button("Snooze until tomorrow") { snooze(agent, tomorrow: true) }
        } label: {
            Image(systemName: "clock")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(FlightDeckPalette.secondary)
                .frame(width: 38, height: 38)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
        }
        .menuStyle(.borderlessButton)
        .help("Snooze \(agent.session.name)")
    }

    private func snooze(_ agent: FlightDeckAgent, tomorrow: Bool) {
        guard let onSnooze else { return }
        if tomorrow {
            let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: Date())
                ?? Date().addingTimeInterval(24 * 60 * 60)
            let tomorrowMorning = Calendar.current.startOfDay(for: nextDay)
                .addingTimeInterval(9 * 60 * 60)
            onSnooze(agent, tomorrowMorning)
        } else {
            onSnooze(agent, Date().addingTimeInterval(60 * 60))
        }
    }

    private func queueStat(_ count: Int, _ label: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(String(format: "%02d", count)).foregroundStyle(color)
            Text(label).foregroundStyle(FlightDeckPalette.muted)
        }
        .font(.flightMono(7))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private enum FlightDeckPullRequestFilter: String, CaseIterable, Identifiable {
    case all = "ALL"
    case ready = "READY"
    case draft = "DRAFT"
    var id: String { rawValue }
}

private struct FlightDeckPullRequestsView: View {
    let pullRequests: [FlightDeckPullRequest]
    let agents: [FlightDeckAgent]
    let workspaces: [FlightDeckWorkspace]
    let selectedID: String?
    let onSelect: (FlightDeckPullRequest) -> Void
    let onViewed: (FlightDeckPullRequest) -> Void
    let onOpenSession: (FlightDeckPullRequest) -> Void
    let onLaunchShell: (FlightDeckPullRequest) -> Void
    let onRefresh: () -> Void

    @State private var filter: FlightDeckPullRequestFilter = .all
    @Environment(\.openURL) private var openURL

    private var filtered: [FlightDeckPullRequest] {
        switch filter {
        case .all: return pullRequests
        case .ready: return pullRequests.filter { !$0.pullRequest.isDraft }
        case .draft: return pullRequests.filter { $0.pullRequest.isDraft }
        }
    }

    private var selected: FlightDeckPullRequest? {
        filtered.first { $0.id == selectedID } ?? filtered.first
    }

    var body: some View {
        VStack(spacing: 0) {
            pageHeader

            HStack(spacing: 0) {
                pullRequestIndex
                    .frame(width: FlightDeckLayout.indexWidth)

                if let selected {
                    FlightDeckPullRequestDetail(
                        item: selected,
                        agent: matchingAgent(for: selected),
                        onOpenSession: { onOpenSession(selected) },
                        onLaunchShell: { onLaunchShell(selected) }
                    )
                } else {
                    FlightDeckEmptyState(
                        title: "Select a pull request",
                        detail: "Review status, checks, comments, and linked work appear here."
                    )
                }
            }
        }
        .background(FlightDeckPalette.background)
        .task(id: selected?.id) {
            if let selected { onViewed(selected) }
        }
    }

    private var pageHeader: some View {
        HStack(alignment: .bottom, spacing: 20) {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel("GITHUB / AUTHORED BY ME")
                Text("Pull requests")
                    .font(.flightSans(22, weight: .bold))
                    .tracking(-0.65)
                Text("Review readiness, checks, comments, and active Mission Control sessions")
                    .font(.flightSans(10))
                    .foregroundStyle(FlightDeckPalette.secondary)
            }
            Spacer()
            HStack(spacing: 8) {
                compactButton("REFRESH", color: FlightDeckPalette.secondary, action: onRefresh)
                compactButton("OPEN ON GITHUB ↗", color: FlightDeckPalette.onAccent, filled: true) {
                    guard let selected, let url = URL(string: selected.pullRequest.url) else { return }
                    openURL(url)
                }
                .disabled(selected == nil)
            }
        }
        .padding(.horizontal, 30)
        .padding(.top, 28)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .bottom)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private var pullRequestIndex: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                ForEach(FlightDeckPullRequestFilter.allCases) { option in
                    Button(filterLabel(option)) { filter = option }
                        .font(.flightMono(6, weight: filter == option ? .bold : .regular))
                        .foregroundStyle(filter == option ? FlightDeckPalette.amber : FlightDeckPalette.secondary)
                        .padding(.horizontal, 10)
                        .frame(height: 26)
                        .background(filter == option ? FlightDeckPalette.raised : Color.clear)
                        .overlay {
                            if filter == option {
                                Rectangle().stroke(FlightDeckPalette.amber.opacity(0.45))
                            }
                        }
                        .buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.horizontal, 18)
            .frame(height: 54)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            if filtered.isEmpty {
                FlightDeckEmptyState(
                    title: filter == .all ? "No open pull requests" : "No \(filter.rawValue.lowercased()) pull requests",
                    detail: "Authored pull requests from connected workspaces appear here."
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filtered) { item in
                            pullRequestRow(item, selected: item.id == selected?.id)
                        }
                    }
                }
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .trailing) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private func matchingAgent(for item: FlightDeckPullRequest) -> FlightDeckAgent? {
        pullRequestMatchingAgent(for: item, agents: agents, workspaces: workspaces)
    }

    private func pullRequestRow(_ item: FlightDeckPullRequest, selected: Bool) -> some View {
        let pullRequest = item.pullRequest
        let agent = matchingAgent(for: item)
        let unreadCount = pullRequest.resolvedUnreadComments.count
        return Button { onSelect(item) } label: {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 8) {
                    Rectangle()
                        .fill(rowSignalColor(pullRequest))
                        .frame(width: 7, height: 7)
                    Text(pullRequest.title)
                        .font(.flightSans(12, weight: .semibold))
                        .foregroundStyle(FlightDeckPalette.text)
                        .lineLimit(1)
                    Spacer()
                    Text(verbatim: "#\(pullRequest.number)")
                        .font(.flightMono(6))
                        .foregroundStyle(FlightDeckPalette.muted)
                }

                HStack(spacing: 7) {
                    compactStatusPill(pullRequestStatusLabel(pullRequest, compact: true), pullRequestStatusColor(pullRequest))
                    if pullRequest.failedCheckCount > 0 {
                        rowMeta("\(pullRequest.failedCheckCount) CHECKS FAILING", FlightDeckPalette.red)
                    } else if unreadCount > 0 {
                        rowMeta("\(unreadCount) NEW COMMENTS", FlightDeckPalette.amber)
                    } else {
                        rowMeta("\(pullRequest.passedCheckCount)/\(pullRequest.checks.count) CHECKS", FlightDeckPalette.green)
                    }
                    if unreadCount == 0 && pullRequest.failedCheckCount == 0 {
                        rowMeta("· \(reviewRowLabel(pullRequest))", FlightDeckPalette.muted)
                    } else if pullRequest.comments.count > 0 {
                        rowMeta("· \(pullRequest.comments.count) COMMENTS", FlightDeckPalette.muted)
                    }
                }

                HStack(spacing: 8) {
                    Text("\(pullRequest.repository.uppercased()) · \(pullRequest.headRefName.uppercased())")
                        .lineLimit(1)
                    Spacer()
                    if agent != nil {
                        Text("● SESSION ACTIVE")
                            .foregroundStyle(FlightDeckPalette.green)
                            .lineLimit(1)
                    }
                }
                .font(.flightMono(6))
                .foregroundStyle(FlightDeckPalette.muted)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: selected ? 106 : 100, alignment: .leading)
        }
        .flightDeckIndexRow(selected: selected)
    }

    private func filterLabel(_ option: FlightDeckPullRequestFilter) -> String {
        let count: Int
        switch option {
        case .all: count = pullRequests.count
        case .ready: count = pullRequests.filter { !$0.pullRequest.isDraft }.count
        case .draft: count = pullRequests.filter { $0.pullRequest.isDraft }.count
        }
        let title = option == .draft ? "DRAFTS" : option.rawValue
        return "\(title) \(String(format: "%02d", count))"
    }

    private func rowSignalColor(_ pullRequest: AuthoredPullRequest) -> Color {
        if pullRequest.failedCheckCount > 0 { return FlightDeckPalette.red }
        if !pullRequest.resolvedUnreadComments.isEmpty { return FlightDeckPalette.amber }
        if pullRequest.isDraft { return FlightDeckPalette.muted }
        return FlightDeckPalette.green
    }

    private func reviewRowLabel(_ pullRequest: AuthoredPullRequest) -> String {
        switch pullRequest.reviewDecision {
        case "APPROVED": return "APPROVED"
        case "CHANGES_REQUESTED": return "CHANGES REQUESTED"
        default: return "UPDATED \(relativeTimestamp(pullRequest.updatedAt))"
        }
    }

    private func rowMeta(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.flightMono(6))
            .foregroundStyle(color)
            .lineLimit(1)
    }

    private func compactStatusPill(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.flightMono(6))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .frame(height: 18)
            .overlay(Rectangle().stroke(color.opacity(0.8)))
    }

    private func compactButton(
        _ title: String,
        color: Color,
        filled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, action: action)
            .font(.flightMono(7, weight: filled ? .bold : .regular))
            .foregroundStyle(color)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(filled ? FlightDeckPalette.amber : Color.clear)
            .overlay {
                if !filled { Rectangle().stroke(FlightDeckPalette.strongBorder) }
            }
            .buttonStyle(.plain)
    }
}

private struct FlightDeckInboxQueue: View {
    let agents: [FlightDeckAgent]
    let pullRequests: [FlightDeckPullRequest]
    let workspaces: [FlightDeckWorkspace]
    let selectedID: String?
    let onSelectAgent: (FlightDeckAgent) -> Void
    let onSelectPullRequest: (FlightDeckPullRequest) -> Void
    let onSnoozeAgent: (FlightDeckAgent, Date) -> Void
    let onSnoozePullRequest: (FlightDeckPullRequest, Date) -> Void

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 9) {
                flightLabel("ALL DEVICES / INBOX")
                Text("\(agents.count + pullRequests.count) need you")
                    .font(.flightSans(24, weight: .bold))
                    .tracking(-0.5)
                HStack(spacing: 0) {
                    queueCount(pullRequests.count, "PULL REQUESTS", FlightDeckPalette.amber)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    queueCount(agents.count, agents.count == 1 ? "AGENT" : "AGENTS", FlightDeckPalette.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    queueCount(0, "SNOOZED", FlightDeckPalette.secondary)
                }
            }
            .padding(22)
            .frame(maxWidth: .infinity, minHeight: 132, alignment: .leading)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(pullRequests) { item in pullRequestRow(item) }
                    ForEach(agents) { agent in agentRow(agent) }
                }
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .trailing) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private func pullRequestRow(_ item: FlightDeckPullRequest) -> some View {
        let selected = selectedID == "pr|\(item.id)"
        let linkedAgent = matchingAgent(for: item)
        let unreadCount = item.pullRequest.resolvedUnreadComments.count
        let attentionColor = item.pullRequest.failedCheckCount > 0 ? FlightDeckPalette.red : FlightDeckPalette.amber
        return Button { onSelectPullRequest(item) } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "arrow.triangle.pull")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(attentionColor)
                    .frame(width: 28, height: 28)
                    .overlay(Rectangle().stroke(attentionColor.opacity(0.75)))

                VStack(alignment: .leading, spacing: 7) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(item.pullRequest.title)
                            .font(.flightSans(12, weight: .semibold))
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text(verbatim: "#\(item.pullRequest.number)")
                            .font(.flightMono(7, weight: .semibold))
                            .foregroundStyle(FlightDeckPalette.muted)
                    }
                    Text(attentionLabel(item.pullRequest, unreadCount: unreadCount))
                        .font(.flightMono(7, weight: .bold))
                        .foregroundStyle(attentionColor)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        Text(item.pullRequest.repository.uppercased())
                        Text("/")
                        Text(item.pullRequest.headRefName.uppercased())
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Rectangle()
                            .fill(linkedAgent == nil ? FlightDeckPalette.muted : FlightDeckPalette.green)
                            .frame(width: 6, height: 6)
                        Text(linkedAgent == nil ? "NO SESSION" : linkedAgent?.session.name.uppercased() ?? "LIVE SESSION")
                            .lineLimit(1)
                    }
                    .font(.flightMono(6, weight: .medium))
                    .foregroundStyle(FlightDeckPalette.muted)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, minHeight: 118, alignment: .leading)
        }
        .flightDeckIndexRow(selected: selected)
        .contextMenu {
            Button("Snooze for 1 hour") { onSnoozePullRequest(item, Date().addingTimeInterval(3600)) }
            Button("Snooze until tomorrow") { onSnoozePullRequest(item, tomorrowMorning()) }
        }
    }

    private func agentRow(_ agent: FlightDeckAgent) -> some View {
        let selected = selectedID == "agent|\(agent.id)"
        return Button { onSelectAgent(agent) } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("AGENT · \((agent.session.agent ?? .shell).displayName.uppercased())")
                        .font(.flightMono(7, weight: .bold)).foregroundStyle(FlightDeckPalette.amber)
                    Spacer()
                    Text(agent.deviceCode).font(.flightMono(7)).foregroundStyle(FlightDeckPalette.muted)
                }
                Text(agent.session.name).font(.flightSans(13, weight: .semibold)).lineLimit(1)
                Text(agent.session.detail ?? agent.session.currentAction ?? "Waiting for your command")
                    .font(.flightSans(10)).foregroundStyle(FlightDeckPalette.secondary).lineLimit(2)
            }
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 118, alignment: .leading)
        }
        .flightDeckIndexRow(selected: selected)
        .contextMenu {
            Button("Snooze for 1 hour") { onSnoozeAgent(agent, Date().addingTimeInterval(3600)) }
            Button("Snooze until tomorrow") { onSnoozeAgent(agent, tomorrowMorning()) }
        }
    }

    private func queueCount(_ count: Int, _ label: String, _ color: Color) -> some View {
        Text(String(format: "%02d %@", count, label))
            .foregroundStyle(count > 0 ? color : FlightDeckPalette.muted)
        .font(.flightMono(6, weight: .semibold))
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
    }

    private func attentionLabel(_ pullRequest: AuthoredPullRequest, unreadCount: Int) -> String {
        if pullRequest.failedCheckCount > 0 {
            return "\(pullRequest.failedCheckCount) REQUIRED CHECK\(pullRequest.failedCheckCount == 1 ? "" : "S") FAILED"
        }
        if unreadCount > 0 {
            return "\(unreadCount) NEW REVIEW COMMENT\(unreadCount == 1 ? "" : "S")"
        }
        return "NEW REVIEW ACTIVITY"
    }

    private func matchingAgent(for item: FlightDeckPullRequest) -> FlightDeckAgent? {
        pullRequestMatchingAgent(for: item, agents: agents, workspaces: workspaces)
    }
}

private struct FlightDeckInboxPullRequestDetail: View {
    let item: FlightDeckPullRequest
    let agent: FlightDeckAgent?
    let onOpenSession: () -> Void
    let onLaunchShell: () -> Void
    let onViewed: () -> Void
    let onSnooze: () -> Void
    let onOpenTerminal: () -> Void

    @Environment(\.openURL) private var openURL

    private var pullRequest: AuthoredPullRequest { item.pullRequest }
    private var isBuildAttention: Bool { pullRequest.failedCheckCount > 0 }
    private var unreadComments: [PullRequestComment] { pullRequest.resolvedUnreadComments }
    private var attentionColor: Color { isBuildAttention ? FlightDeckPalette.red : FlightDeckPalette.amber }

    var body: some View {
        GeometryReader { geometry in
            let detailWidth = max(520, geometry.size.width - 324)

            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    compactHeader
                    ScrollView {
                        attentionContent
                            .frame(maxWidth: 540, alignment: .leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(FlightDeckPalette.background)

                    stickyActions
                }
                .frame(width: detailWidth)
                .frame(maxHeight: .infinity)

                inspector
                    .frame(width: 324)
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .leading)
        }
        .frame(minWidth: 844, maxWidth: .infinity, maxHeight: .infinity)
        .background(FlightDeckPalette.background)
        .task(id: item.id) { onViewed() }
    }

    private var compactHeader: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    flightLabel("PULL REQUEST / #\(pullRequest.number)")
                    compactStatusPill(
                        pullRequest.isDraft ? "DRAFT" : "READY",
                        pullRequest.isDraft ? FlightDeckPalette.secondary : FlightDeckPalette.green
                    )
                }
                Text(pullRequest.title)
                    .font(.flightSans(14, weight: .bold))
                    .tracking(-0.25)
                    .lineLimit(1)
                Text("\(pullRequest.headRefName)  →  \(pullRequest.baseRefName)  ·  UPDATED \(relativeTimestamp(pullRequest.updatedAt))")
                    .font(.flightMono(6, weight: .medium))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 12)
            Button {
                onViewed()
                openPullRequest()
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: 32, height: 32)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }
            .buttonStyle(.plain)
            .foregroundStyle(FlightDeckPalette.secondary)
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
        .background(FlightDeckPalette.chrome)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private func compactStatusPill(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.flightMono(6, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .frame(height: 18)
            .overlay(Rectangle().stroke(color))
    }

    @ViewBuilder
    private var attentionContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            attentionBanner
            if isBuildAttention {
                failedChecks
            } else {
                unreadReviewThreads
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 24)
    }

    private var attentionBanner: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: isBuildAttention ? "xmark" : "bubble.left")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(attentionColor)
                .frame(width: 30, height: 30)
                .overlay(Rectangle().stroke(attentionColor.opacity(0.8)))

            VStack(alignment: .leading, spacing: 6) {
                Text(attentionHeadline)
                    .font(.flightMono(8, weight: .bold))
                    .foregroundStyle(attentionColor)
                Text(attentionDetail)
                    .font(.flightSans(10))
                    .foregroundStyle(FlightDeckPalette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(pullRequest.workspaceName.uppercased())  /  \(item.deviceCode)  /  \(pullRequest.headRefName.uppercased())")
                    .font(.flightMono(6, weight: .medium))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .lineLimit(1)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 82, alignment: .leading)
        .background(attentionColor.opacity(0.07))
        .overlay(Rectangle().stroke(attentionColor.opacity(0.4)))
    }

    private var attentionHeadline: String {
        if isBuildAttention {
            return "\(pullRequest.failedCheckCount) REQUIRED CHECK\(pullRequest.failedCheckCount == 1 ? "" : "S") FAILED"
        }
        if unreadComments.isEmpty { return "NEW REVIEW ACTIVITY" }
        return "\(unreadComments.count) COMMENT\(unreadComments.count == 1 ? "" : "S") SINCE YOU LAST LOOKED"
    }

    private var attentionDetail: String {
        if isBuildAttention {
            return agent == nil
                ? "This pull request needs a fix and has no active Mission Control session."
                : "Mission Control found the active session working on this pull request branch."
        }
        return agent == nil
            ? "This pull request has no active Mission Control session."
            : "Mission Control found the active session for this pull request branch."
    }

    private var unreadReviewThreads: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeading("UNREAD REVIEW THREADS", trailing: unreadComments.isEmpty ? "NEW" : "\(unreadComments.count) TOTAL")

            if unreadComments.isEmpty {
                HStack(spacing: 12) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .foregroundStyle(FlightDeckPalette.amber)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("NEW COMMENTS AND REVIEW ACTIVITY")
                            .font(.flightMono(7, weight: .bold))
                        Text("Open the pull request to review the latest GitHub activity.")
                            .font(.flightSans(10))
                            .foregroundStyle(FlightDeckPalette.secondary)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, minHeight: 74, alignment: .leading)
                .background(FlightDeckPalette.surface)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            } else {
                ForEach(Array(unreadComments.prefix(2))) { comment in
                    unreadCommentCard(comment)
                }
            }

            Button {
                onViewed()
                openPullRequest()
            } label: {
                HStack {
                    Text(unreadComments.isEmpty ? "VIEW COMMENTS ON GITHUB" : "VIEW ALL \(unreadComments.count) COMMENTS ON GITHUB")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }
                .font(.flightMono(7, weight: .semibold))
                .foregroundStyle(FlightDeckPalette.secondary)
                .padding(.horizontal, 14)
                .frame(height: 38)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }
            .buttonStyle(.plain)
        }
    }

    private func unreadCommentCard(_ comment: PullRequestComment) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(String(comment.author.prefix(2)).uppercased())
                .font(.flightMono(6, weight: .bold))
                .foregroundStyle(FlightDeckPalette.amber)
                .frame(width: 30, height: 30)
                .background(FlightDeckPalette.background)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("@\(comment.author)")
                        .font(.flightMono(7, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.text)
                    if let path = comment.path {
                        Text("commented on \(path.split(separator: "/").last.map(String.init) ?? path)")
                            .font(.flightSans(9))
                            .foregroundStyle(FlightDeckPalette.muted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    Text(relativeTimestamp(comment.createdAt ?? ""))
                        .font(.flightMono(6))
                        .foregroundStyle(FlightDeckPalette.muted)
                }
                Text(comment.body)
                    .font(.flightSans(10))
                    .foregroundStyle(FlightDeckPalette.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                if let path = comment.path {
                    Text("\(path)\(comment.line.map { ":\($0)" } ?? "")")
                        .font(.flightMono(6))
                        .foregroundStyle(FlightDeckPalette.muted)
                        .lineLimit(1)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
        .background(FlightDeckPalette.surface)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private var failedChecks: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeading("FAILED CHECKS", trailing: "LATEST COMMIT")
            ForEach(pullRequest.checks.filter { $0.state == "fail" }.prefix(3)) { check in
                HStack(spacing: 12) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.red)
                        .frame(width: 28, height: 28)
                        .overlay(Rectangle().stroke(FlightDeckPalette.red.opacity(0.65)))
                    Text(check.name)
                        .font(.flightSans(11, weight: .semibold))
                        .lineLimit(1)
                    Spacer()
                    Text("FAIL")
                        .font(.flightMono(7, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.red)
                }
                .padding(.horizontal, 14)
                .frame(height: 56)
                .background(FlightDeckPalette.surface)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }

            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "terminal")
                    .foregroundStyle(FlightDeckPalette.secondary)
                VStack(alignment: .leading, spacing: 5) {
                    Text("LATEST FAILURE")
                        .font(.flightMono(7, weight: .bold))
                    Text("Open the check run on GitHub to inspect logs and annotations from the latest commit.")
                        .font(.flightSans(10))
                        .foregroundStyle(FlightDeckPalette.secondary)
                }
            }
            .padding(15)
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
            .background(FlightDeckPalette.surface)
            .overlay(Rectangle().stroke(FlightDeckPalette.border))

            Button {
                openPullRequest()
            } label: {
                HStack {
                    Text("VIEW CHECK RUNS ON GITHUB")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }
                .font(.flightMono(7, weight: .semibold))
                .foregroundStyle(FlightDeckPalette.secondary)
                .padding(.horizontal, 14)
                .frame(height: 38)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }
            .buttonStyle(.plain)
        }
    }

    private func sectionHeading(_ title: String, trailing: String) -> some View {
        HStack {
            flightLabel(title)
            Spacer()
            Text(trailing)
                .font(.flightMono(6, weight: .semibold))
                .foregroundStyle(FlightDeckPalette.muted)
        }
    }

    private var stickyActions: some View {
        HStack(spacing: 10) {
            if agent != nil {
                Button("OPEN ACTIVE SESSION", action: onOpenSession)
                    .buttonStyle(FlightDeckAccentButtonStyle())
                Button("TERMINAL", action: onOpenTerminal)
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                Button("SNOOZE", action: onSnooze)
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                Spacer()
                Text(agent?.session.name.uppercased() ?? "LIVE SESSION")
                    .font(.flightMono(6))
                    .foregroundStyle(FlightDeckPalette.muted)
            } else {
                Button("LAUNCH SHELL IN WORKSPACE", action: onLaunchShell)
                    .buttonStyle(FlightDeckAccentButtonStyle())
                Button("SNOOZE", action: onSnooze)
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                Spacer()
                Text("OPENS \(pullRequest.headRefName.uppercased())")
                    .font(.flightMono(6))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: 540, minHeight: 68)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FlightDeckPalette.chrome)
        .overlay(alignment: .top) { Divider().overlay(FlightDeckPalette.border) }
    }

    private var inspector: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel("PR TELEMETRY")
                Text(isBuildAttention ? "Build attention" : "Review attention")
                    .font(.flightSans(18, weight: .bold))
                    .tracking(-0.35)
                Text(isBuildAttention
                     ? "\(pullRequest.failedCheckCount) FAILED CHECK\(pullRequest.failedCheckCount == 1 ? "" : "S")"
                     : unreadInspectorLabel)
                    .font(.flightMono(8, weight: .bold))
                    .foregroundStyle(attentionColor)
            }
            .padding(22)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    inspectorMetric(
                        "CHECKS",
                        "\(pullRequest.passedCheckCount)/\(pullRequest.checks.count)",
                        pullRequest.failedCheckCount > 0 ? "\(pullRequest.failedCheckCount) FAILED" : "PASSING",
                        pullRequest.failedCheckCount > 0 ? FlightDeckPalette.red : FlightDeckPalette.green
                    )
                    inspectorMetric("REVIEW", reviewMetric, reviewDetail, FlightDeckPalette.amber)
                }
                inspectorRow("AUTHOR", "YOU")
                inspectorRow("WORKSPACE", pullRequest.workspaceName.uppercased())
                inspectorRow("SESSION", agent?.session.name.uppercased() ?? "NONE")
                inspectorRow("DEVICE", item.deviceCode)
            }
            .padding(20)
            .frame(minHeight: 223, alignment: .top)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(alignment: .leading, spacing: 15) {
                flightLabel("WHY THIS IS IN INBOX")
                reasonRow("FAILING CHECKS", active: pullRequest.failedCheckCount > 0, color: FlightDeckPalette.red)
                reasonRow("NEW REVIEW ACTIVITY", active: pullRequest.hasUnreadActivity, color: FlightDeckPalette.amber)
                reasonRow(agent == nil ? "NO ACTIVE SESSION" : "ACTIVE SESSION LINKED", active: agent != nil, color: FlightDeckPalette.green)
            }
            .padding(20)
            .frame(maxWidth: .infinity, minHeight: 230, alignment: .topLeading)

            Spacer()
        }
        .background(FlightDeckPalette.chrome)
        .overlay(alignment: .leading) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private var unreadInspectorLabel: String {
        unreadComments.isEmpty ? "UNREAD ACTIVITY" : "\(unreadComments.count) UNREAD COMMENT\(unreadComments.count == 1 ? "" : "S")"
    }

    private var reviewMetric: String {
        switch pullRequest.reviewDecision {
        case "APPROVED": return "APPROVED"
        case "CHANGES_REQUESTED": return "CHANGES"
        default: return "PENDING"
        }
    }

    private var reviewDetail: String {
        switch pullRequest.reviewDecision {
        case "APPROVED": return "READY"
        case "CHANGES_REQUESTED": return "REQUESTED"
        default: return "AWAITING"
        }
    }

    private func inspectorMetric(_ label: String, _ value: String, _ detail: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            flightLabel(label)
            Text(value)
                .font(.flightSans(value.count > 8 ? 11 : 17, weight: .bold))
                .foregroundStyle(FlightDeckPalette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text(detail)
                .font(.flightMono(6, weight: .bold))
                .foregroundStyle(color)
                .lineLimit(1)
        }
        .padding(13)
        .frame(maxWidth: .infinity, minHeight: 86, alignment: .topLeading)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private func inspectorRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label).foregroundStyle(FlightDeckPalette.muted)
            Spacer(minLength: 6)
            Text(value).foregroundStyle(FlightDeckPalette.text).multilineTextAlignment(.trailing).lineLimit(1)
        }
        .font(.flightMono(7, weight: .semibold))
    }

    private func reasonRow(_ text: String, active: Bool, color: Color) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(active ? color : Color.clear)
                .frame(width: 8, height: 8)
                .overlay(Circle().stroke(active ? color : FlightDeckPalette.muted))
            Text(text)
                .font(.flightMono(7, weight: .semibold))
                .foregroundStyle(active ? FlightDeckPalette.text : FlightDeckPalette.muted)
        }
    }

    private func openPullRequest() {
        guard let url = URL(string: pullRequest.url) else { return }
        openURL(url)
    }
}

private struct FlightDeckPullRequestDetail: View {
    let item: FlightDeckPullRequest
    let agent: FlightDeckAgent?
    let onOpenSession: () -> Void
    let onLaunchShell: () -> Void

    @Environment(\.openURL) private var openURL
    @State private var timeline: [PullRequestTimelineItem] = []
    @State private var timelineLoading = true
    @State private var timelineError: String?
    @State private var reviewCutoff: String?

    private var pullRequest: AuthoredPullRequest { item.pullRequest }
    private var unreadComments: [PullRequestComment] { pullRequest.resolvedUnreadComments }
    private var attentionColor: Color {
        if pullRequest.failedCheckCount > 0 { return FlightDeckPalette.red }
        if !unreadComments.isEmpty { return FlightDeckPalette.amber }
        return FlightDeckPalette.green
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            attentionBanner
            reviewDetails
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(FlightDeckPalette.background)
        .task(id: item.id) {
            reviewCutoff = pullRequest.unreadSince
            await loadTimeline()
        }
    }

    private var header: some View {
        HStack(spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 9) {
                    flightLabel("SELECTED PR / #\(pullRequest.number)")
                    smallStatusPill(
                        pullRequestStatusLabel(pullRequest),
                        pullRequestStatusColor(pullRequest)
                    )
                }
                Text(pullRequest.title)
                    .font(.flightSans(16, weight: .bold))
                    .lineLimit(1)
                Text("\(pullRequest.repository.uppercased()) · \(pullRequest.headRefName.uppercased()) → \(pullRequest.baseRefName.uppercased())")
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.secondary)
                    .lineLimit(1)
            }
            Spacer()
            detailButton("OPEN ON GITHUB ↗", color: FlightDeckPalette.secondary) {
                if let url = URL(string: pullRequest.url) { openURL(url) }
            }
        }
        .padding(.horizontal, 26)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private var attentionBanner: some View {
        HStack(spacing: 18) {
            HStack(alignment: .top, spacing: 12) {
                Text(pullRequest.failedCheckCount > 0 ? "!" : (unreadComments.isEmpty ? "✓" : "!"))
                    .font(.flightMono(14, weight: .bold))
                    .foregroundStyle(attentionColor)
                    .frame(width: 12)
                VStack(alignment: .leading, spacing: 5) {
                    Text(attentionTitle)
                        .font(.flightMono(7, weight: .bold))
                        .foregroundStyle(attentionColor)
                    Text(attentionDescription)
                        .font(.flightSans(10))
                        .foregroundStyle(FlightDeckPalette.text)
                        .lineLimit(1)
                    Text(attentionMetadata)
                        .font(.flightMono(6))
                        .foregroundStyle(FlightDeckPalette.muted)
                        .lineLimit(1)
                }
            }
            Spacer()
            HStack(spacing: 8) {
                if agent != nil {
                    detailButton("OPEN SESSION", color: FlightDeckPalette.onAccent, filled: true, action: onOpenSession)
                    detailButton("TERMINAL", color: FlightDeckPalette.secondary, action: onOpenSession)
                } else {
                    detailButton("LAUNCH SHELL", color: FlightDeckPalette.onAccent, filled: true, action: onLaunchShell)
                }
            }
        }
        .padding(.horizontal, 26)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, minHeight: 92)
        .background(FlightDeckPalette.raised)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private var reviewDetails: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 10) {
                    summaryMetric("REVIEW", reviewValue, reviewDetail, reviewAccent)
                    summaryMetric(
                        "CHECKS",
                        checksValue,
                        checksDetail,
                        pullRequest.failedCheckCount > 0 ? FlightDeckPalette.red : FlightDeckPalette.green
                    )
                    changesMetric
                }
                pullRequestDescription
                pullRequestTimeline
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var pullRequestDescription: some View {
        VStack(alignment: .leading, spacing: 12) {
            flightLabel("DESCRIPTION")
            if let body = pullRequest.body?.trimmingCharacters(in: .whitespacesAndNewlines), !body.isEmpty {
                PullRequestMarkdownBody(text: body)
            } else {
                Text("NO DESCRIPTION PROVIDED")
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .padding(16)
                    .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                    .background(FlightDeckPalette.surface)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }
        }
    }

    private var pullRequestTimeline: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                flightLabel("COMMITS & GITHUB ACTIVITY")
                Spacer()
                if !timelineLoading {
                    Text("\(timeline.count) EVENTS")
                        .font(.flightMono(6))
                        .foregroundStyle(FlightDeckPalette.muted)
                }
            }

            if timelineLoading {
                HStack(spacing: 10) {
                    ProgressView().tint(FlightDeckPalette.secondary)
                    Text("LOADING PULL REQUEST HISTORY")
                        .font(.flightMono(7))
                        .foregroundStyle(FlightDeckPalette.muted)
                }
                .padding(16)
            } else if let timelineError {
                Text(timelineError.uppercased())
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.red)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
            } else if timeline.isEmpty {
                Text("NO COMMITS OR GITHUB ACTIVITY FOUND")
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(timeline.enumerated()), id: \.element.id) { index, event in
                        timelineRow(event, isLast: index == timeline.count - 1)
                    }
                }
            }
        }
    }

    private func timelineRow(_ event: PullRequestTimelineItem, isLast: Bool) -> some View {
        Button {
            if let url = URL(string: event.url), !event.url.isEmpty { openURL(url) }
        } label: {
            HStack(alignment: .top, spacing: 14) {
                VStack(spacing: 0) {
                    Text(timelineSymbol(event))
                        .font(.flightMono(7, weight: .bold))
                        .foregroundStyle(timelineColor(event))
                        .frame(width: 30, height: 30)
                        .background(FlightDeckPalette.background)
                        .overlay(Rectangle().stroke(timelineColor(event).opacity(0.75)))
                    if !isLast {
                        Rectangle()
                            .fill(FlightDeckPalette.border)
                            .frame(width: 1)
                            .frame(minHeight: 54)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(timelineTitle(event))
                            .font(.flightSans(10, weight: .semibold))
                            .foregroundStyle(FlightDeckPalette.text)
                        if isNewTimelineEvent(event) {
                            Text("NEW")
                                .font(.flightMono(6, weight: .bold))
                                .foregroundStyle(FlightDeckPalette.amber)
                                .padding(.horizontal, 6)
                                .frame(height: 18)
                                .overlay(Rectangle().stroke(FlightDeckPalette.amber))
                        }
                        Spacer(minLength: 8)
                        Text(relativeTimestamp(event.createdAt))
                            .font(.flightMono(6))
                            .foregroundStyle(FlightDeckPalette.muted)
                    }
                    if !event.body.isEmpty {
                        Text(event.body)
                            .font(.flightSans(10))
                            .foregroundStyle(FlightDeckPalette.secondary)
                            .lineLimit(event.kind == "commit" ? 3 : 5)
                            .multilineTextAlignment(.leading)
                    }
                    if let path = event.path {
                        Text("\(path)\(event.line.map { ":\($0)" } ?? "")")
                            .font(.flightMono(6))
                            .foregroundStyle(FlightDeckPalette.muted)
                            .lineLimit(1)
                    }
                }
                .padding(.bottom, isLast ? 0 : 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(event.url.isEmpty)
    }

    private func timelineTitle(_ event: PullRequestTimelineItem) -> String {
        switch event.kind {
        case "commit":
            return "\(event.author) committed \(event.sha.map { String($0.prefix(7)) } ?? "changes")"
        case "review_comment": return "\(event.author) commented on the diff"
        case "comment": return "\(event.author) commented"
        case "review":
            switch event.state {
            case "APPROVED": return "\(event.author) approved the pull request"
            case "CHANGES_REQUESTED": return "\(event.author) requested changes"
            case "DISMISSED": return "\(event.author)'s review was dismissed"
            default: return "\(event.author) submitted a review"
            }
        default: return "GitHub activity"
        }
    }

    private func timelineSymbol(_ event: PullRequestTimelineItem) -> String {
        switch event.kind {
        case "commit": return "⌁"
        case "review": return event.state == "APPROVED" ? "✓" : "R"
        default: return "C"
        }
    }

    private func timelineColor(_ event: PullRequestTimelineItem) -> Color {
        if event.kind == "commit" { return FlightDeckPalette.secondary }
        if event.state == "APPROVED" { return FlightDeckPalette.green }
        if event.state == "CHANGES_REQUESTED" { return FlightDeckPalette.red }
        return FlightDeckPalette.amber
    }

    private func isNewTimelineEvent(_ event: PullRequestTimelineItem) -> Bool {
        guard let reviewCutoff else { return false }
        return event.createdAt > reviewCutoff
    }

    private func loadTimeline() async {
        timelineLoading = true
        timelineError = nil
        guard let api = APIClient(urlString: item.server.url, token: item.server.token) else {
            timelineLoading = false
            timelineError = "Timeline unavailable"
            return
        }
        do {
            timeline = try await api.pullRequestTimeline(
                repository: pullRequest.repository,
                number: pullRequest.number
            )
        } catch {
            timelineError = "Couldn't load GitHub timeline"
        }
        timelineLoading = false
    }

    private func summaryMetric(_ label: String, _ value: String, _ detail: String, _ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(.flightMono(6))
                .foregroundStyle(FlightDeckPalette.muted)
            Text(value)
                .font(.flightSans(14, weight: .bold))
                .foregroundStyle(FlightDeckPalette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(detail)
                .font(.flightMono(6))
                .foregroundStyle(accent)
                .lineLimit(1)
        }
        .padding(13)
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private var changesMetric: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("CHANGES")
                .font(.flightMono(6))
                .foregroundStyle(FlightDeckPalette.muted)
            Text("\(pullRequest.changedFiles) files")
                .font(.flightSans(14, weight: .bold))
                .foregroundStyle(FlightDeckPalette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(spacing: 5) {
                Text("+\(pullRequest.additions)")
                    .foregroundStyle(FlightDeckPalette.green)
                Text("−\(pullRequest.deletions)")
                    .foregroundStyle(FlightDeckPalette.red)
            }
            .font(.flightMono(6))
            .lineLimit(1)
        }
        .padding(13)
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private var attentionTitle: String {
        if pullRequest.failedCheckCount > 0 {
            return "\(pullRequest.failedCheckCount) CHECK\(pullRequest.failedCheckCount == 1 ? "" : "S") NEED ATTENTION"
        }
        if !unreadComments.isEmpty {
            return "\(unreadComments.count) NEW REVIEW COMMENT\(unreadComments.count == 1 ? "" : "S")"
        }
        return "READY FOR FLIGHT"
    }

    private var attentionDescription: String {
        if let agent {
            return "A live \((agent.session.agent ?? .shell).displayName) session is already targeting this PR branch."
        }
        if pullRequest.failedCheckCount > 0 {
            return "Launch a shell in the linked workspace to address the failing checks."
        }
        if !unreadComments.isEmpty {
            return "New review activity is waiting for you on this pull request."
        }
        return "Checks and review status are clear; there is no active session on this branch."
    }

    private var attentionMetadata: String {
        if let agent {
            return "\(agent.session.name.uppercased()) · \(item.deviceCode) · SESSION ACTIVE"
        }
        return "\(pullRequest.workspaceName.uppercased()) · \(item.deviceCode) · NO ACTIVE SESSION"
    }

    private var reviewValue: String {
        switch pullRequest.reviewDecision {
        case "APPROVED": return "Approved"
        case "CHANGES_REQUESTED": return "Changes requested"
        case "REVIEW_REQUIRED": return "Review required"
        default: return pullRequest.isDraft ? "Draft" : "Awaiting review"
        }
    }

    private var reviewDetail: String {
        unreadComments.isEmpty
            ? "NO UNREAD COMMENTS"
            : "\(unreadComments.count) UNREAD COMMENT\(unreadComments.count == 1 ? "" : "S")"
    }

    private var reviewAccent: Color {
        unreadComments.isEmpty ? FlightDeckPalette.muted : FlightDeckPalette.amber
    }

    private var checksValue: String {
        if pullRequest.checks.isEmpty { return "No checks" }
        return "\(pullRequest.passedCheckCount) / \(pullRequest.checks.count) passing"
    }

    private var checksDetail: String {
        if pullRequest.failedCheckCount > 0 { return "\(pullRequest.failedCheckCount) FAILED" }
        if pullRequest.pendingCheckCount > 0 { return "\(pullRequest.pendingCheckCount) PENDING" }
        let skippedCount = pullRequest.checks.count
            - pullRequest.passedCheckCount
            - pullRequest.failedCheckCount
            - pullRequest.pendingCheckCount
        if skippedCount > 0 { return "\(skippedCount) SKIPPING" }
        return "ALL PASSING"
    }

    private func smallStatusPill(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.flightMono(6))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .frame(height: 18)
            .overlay(Rectangle().stroke(color.opacity(0.8)))
    }

    private func detailButton(
        _ title: String,
        color: Color,
        filled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, action: action)
            .font(.flightMono(7, weight: filled ? .bold : .regular))
            .foregroundStyle(color)
            .padding(.horizontal, 13)
            .frame(height: 36)
            .background(filled ? FlightDeckPalette.amber : Color.clear)
            .overlay {
                if !filled { Rectangle().stroke(FlightDeckPalette.strongBorder) }
            }
            .buttonStyle(.plain)
    }
}

private struct PullRequestMarkdownBody: View {
    private enum MediaKind {
        case image
        case video
        case unknown
    }

    private enum Block: Identifiable {
        case markdown(Int, String)
        case media(Int, URL, MediaKind)

        var id: Int {
            switch self {
            case let .markdown(id, _), let .media(id, _, _): return id
            }
        }
    }

    private let blocks: [Block]

    init(text: String) {
        blocks = Self.parse(text)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(blocks) { block in
                switch block {
                case let .markdown(_, text):
                    MarkdownText(text: text, color: FlightDeckPalette.text)
                case let .media(_, url, kind):
                    PullRequestRemoteMedia(url: url, declaredKind: remoteKind(kind))
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FlightDeckPalette.surface)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private func remoteKind(_ kind: MediaKind) -> PullRequestRemoteMedia.Kind {
        switch kind {
        case .image: return .image
        case .video: return .video
        case .unknown: return .unknown
        }
    }

    private static func parse(_ text: String) -> [Block] {
        var blocks: [Block] = []
        var markdown: [String] = []
        var nextID = 0
        let visibleText = text.replacingOccurrences(
            of: #"(?s)<!--.*?-->"#,
            with: "",
            options: .regularExpression
        )

        func flushMarkdown() {
            let value = markdown.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty {
                blocks.append(.markdown(nextID, value))
                nextID += 1
            }
            markdown.removeAll()
        }

        for line in visibleText.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if let match = mediaMatch(trimmed) {
                flushMarkdown()
                blocks.append(.media(nextID, match.url, match.kind))
                nextID += 1
            } else {
                markdown.append(line)
            }
        }
        flushMarkdown()
        return blocks
    }

    private static func mediaMatch(_ line: String) -> (url: URL, kind: MediaKind)? {
        if let value = capture(#"^!\[[^\]]*\]\((https?://[^\s\)]+)(?:\s+[^\)]*)?\)$"#, in: line),
           let url = URL(string: value) {
            return (url, .image)
        }
        if let value = capture(#"^<img[^>]+src=[\"']([^\"']+)[\"'][^>]*>.*$"#, in: line),
           let url = URL(string: value) {
            return (url, .image)
        }
        if let value = capture(#"^<video[^>]+src=[\"']([^\"']+)[\"'][^>]*>.*$"#, in: line),
           let url = URL(string: value) {
            return (url, .video)
        }
        guard line.range(of: #"^https?://\S+$"#, options: .regularExpression) != nil,
              let url = URL(string: line) else { return nil }
        let path = url.path.lowercased()
        if [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].contains(where: path.hasSuffix) {
            return (url, .image)
        }
        if [".mp4", ".mov", ".m4v", ".webm"].contains(where: path.hasSuffix) {
            return (url, .video)
        }
        return url.host?.contains("user-attachments") == true ? (url, .unknown) : nil
    }

    private static func capture(_ pattern: String, in value: String) -> String? {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
              match.numberOfRanges > 1,
              let range = Range(match.range(at: 1), in: value) else { return nil }
        return String(value[range])
    }
}

private struct PullRequestRemoteMedia: View {
    enum Kind {
        case image
        case video
        case unknown
    }

    let url: URL
    let declaredKind: Kind
    @State private var resolvedKind: Kind?

    var body: some View {
        Group {
            switch resolvedKind ?? declaredKind {
            case .image: remoteImage
            case .video: PullRequestVideoPlayer(url: url)
            case .unknown: mediaPlaceholder
            }
        }
        .task(id: url) {
            if declaredKind == .unknown { await resolveKind() }
        }
    }

    private var remoteImage: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case let .success(image):
                Link(destination: url) {
                    image
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity, maxHeight: 520)
                }
                .buttonStyle(.plain)
            case .failure:
                mediaLink("OPEN IMAGE ON GITHUB")
            default:
                ProgressView()
                    .tint(FlightDeckPalette.secondary)
                    .frame(maxWidth: .infinity, minHeight: 140)
            }
        }
        .background(FlightDeckPalette.background)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private var mediaPlaceholder: some View {
        HStack(spacing: 10) {
            ProgressView().tint(FlightDeckPalette.secondary)
            Text("LOADING ATTACHMENT")
                .font(.flightMono(7))
                .foregroundStyle(FlightDeckPalette.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 96)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private func mediaLink(_ title: String) -> some View {
        Link(title, destination: url)
            .font(.flightMono(7, weight: .semibold))
            .foregroundStyle(FlightDeckPalette.secondary)
            .frame(maxWidth: .infinity, minHeight: 72)
            .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private func resolveKind() async {
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 15
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let contentType = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")?.lowercased() ?? ""
            if contentType.hasPrefix("image/") {
                resolvedKind = .image
            } else if contentType.hasPrefix("video/") {
                resolvedKind = .video
            } else {
                resolvedKind = .image
            }
        } catch {
            resolvedKind = .image
        }
    }
}

private struct PullRequestVideoPlayer: View {
    let url: URL
    @State private var player: AVPlayer

    init(url: URL) {
        self.url = url
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        VideoPlayer(player: player)
            .frame(maxWidth: .infinity, minHeight: 320, maxHeight: 520)
            .background(Color.black)
            .overlay(Rectangle().stroke(FlightDeckPalette.border))
            .onDisappear { player.pause() }
    }
}

private struct LegacyFlightDeckPullRequestDetail: View {
    let item: FlightDeckPullRequest
    let agent: FlightDeckAgent?
    let onOpenSession: () -> Void
    let onLaunchShell: () -> Void
    let onViewed: () -> Void
    let onSnooze: (() -> Void)?
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    attentionBanner
                    comments
                    checks
                }
            }
            .frame(maxWidth: .infinity)
            .background(FlightDeckPalette.background)

            inspector
                .frame(width: 324)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    flightLabel("\(item.pullRequest.repository.uppercased()) / PULL REQUEST #\(item.pullRequest.number)")
                    Text(item.pullRequest.title)
                        .font(.flightSans(25, weight: .bold))
                        .tracking(-0.5)
                    Text("\(item.pullRequest.headRefName)  →  \(item.pullRequest.baseRefName)")
                        .font(.flightMono(8))
                        .foregroundStyle(FlightDeckPalette.secondary)
                }
                Spacer()
                statusPill(item.pullRequest.isDraft ? "DRAFT" : "READY", item.pullRequest.isDraft ? FlightDeckPalette.secondary : FlightDeckPalette.green)
            }

            HStack(spacing: 10) {
                if agent != nil {
                    Button("OPEN SESSION", action: onOpenSession)
                        .buttonStyle(FlightDeckAccentButtonStyle())
                    Button("TERMINAL", action: onOpenSession)
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.amber))
                } else {
                    Button("LAUNCH SHELL IN WORKSPACE", action: onLaunchShell)
                        .buttonStyle(FlightDeckAccentButtonStyle())
                }
                Button("OPEN ON GITHUB") {
                    onViewed()
                    if let url = URL(string: item.pullRequest.url) { openURL(url) }
                }
                .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                if let onSnooze {
                    Button("SNOOZE 1H", action: onSnooze)
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                }
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    @ViewBuilder
    private var attentionBanner: some View {
        if item.pullRequest.failedCheckCount > 0 || item.pullRequest.hasUnreadActivity {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: item.pullRequest.failedCheckCount > 0 ? "xmark.octagon" : "bubble.left.and.bubble.right")
                    .foregroundStyle(item.pullRequest.failedCheckCount > 0 ? FlightDeckPalette.red : FlightDeckPalette.amber)
                VStack(alignment: .leading, spacing: 5) {
                    Text(inboxReason(item.pullRequest).uppercased())
                        .font(.flightMono(8, weight: .bold))
                    Text(item.pullRequest.failedCheckCount > 0
                         ? "Resolve the failing checks before this pull request can move forward."
                         : "New GitHub activity has not been reviewed from Mission Control yet.")
                        .font(.flightSans(10))
                        .foregroundStyle(FlightDeckPalette.secondary)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((item.pullRequest.failedCheckCount > 0 ? FlightDeckPalette.red : FlightDeckPalette.amber).opacity(0.08))
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
        }
    }

    private var comments: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                flightLabel("LATEST COMMENTS")
                Spacer()
                Text(String(format: "%02d", item.pullRequest.comments.count))
                    .font(.flightMono(8)).foregroundStyle(FlightDeckPalette.amber)
            }
            if item.pullRequest.comments.isEmpty {
                Text("NO REVIEW COMMENTS YET")
                    .font(.flightMono(8)).foregroundStyle(FlightDeckPalette.muted)
                    .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            } else {
                ForEach(item.pullRequest.comments.prefix(3)) { comment in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text("@\(comment.author)").font(.flightMono(8, weight: .semibold)).foregroundStyle(FlightDeckPalette.amber)
                            Spacer()
                            Text(relativeTimestamp(comment.createdAt ?? "")).font(.flightMono(7)).foregroundStyle(FlightDeckPalette.muted)
                        }
                        Text(comment.body).font(.flightSans(11)).foregroundStyle(FlightDeckPalette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(FlightDeckPalette.surface)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
                }
            }
        }
        .padding(28)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private var checks: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                flightLabel("CHECKS / \(String(format: "%02d", item.pullRequest.checks.count))")
                Spacer()
                Text("\(item.pullRequest.passedCheckCount) PASS")
                    .font(.flightMono(7)).foregroundStyle(FlightDeckPalette.green)
                if item.pullRequest.failedCheckCount > 0 {
                    Text("\(item.pullRequest.failedCheckCount) FAIL")
                        .font(.flightMono(7)).foregroundStyle(FlightDeckPalette.red)
                }
            }
            ForEach(item.pullRequest.checks.prefix(8)) { check in
                HStack(spacing: 10) {
                    Image(systemName: check.state == "pass" ? "checkmark" : (check.state == "fail" ? "xmark" : "clock"))
                        .foregroundStyle(checkColor(check.state))
                    Text(check.name).font(.flightSans(10)).lineLimit(1)
                    Spacer()
                    Text(check.state.uppercased()).font(.flightMono(7)).foregroundStyle(checkColor(check.state))
                }
            }
        }
        .padding(28)
    }

    private var inspector: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel("PULL REQUEST STATUS")
                Text("Flight readiness")
                    .font(.flightSans(22, weight: .bold))
                Text(item.pullRequest.failedCheckCount > 0 ? "ACTION REQUIRED" : "ON TRACK")
                    .font(.flightMono(8))
                    .foregroundStyle(item.pullRequest.failedCheckCount > 0 ? FlightDeckPalette.red : FlightDeckPalette.green)
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    metric("FILES", "\(item.pullRequest.changedFiles)", FlightDeckPalette.text)
                    metric("CHANGES", "+\(item.pullRequest.additions) −\(item.pullRequest.deletions)", FlightDeckPalette.amber)
                }
                detailRow("REVIEW", reviewLabel)
                detailRow("WORKSPACE", item.pullRequest.workspaceName.uppercased())
                detailRow("DEVICE", item.deviceCode)
                detailRow("SESSION", agent?.session.name ?? "NONE")
                detailRow("UPDATED", relativeTimestamp(item.pullRequest.updatedAt))
            }
            .padding(20)
            Spacer()
        }
        .background(FlightDeckPalette.chrome)
        .overlay(alignment: .leading) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private var reviewLabel: String {
        switch item.pullRequest.reviewDecision {
        case "APPROVED": return "APPROVED"
        case "CHANGES_REQUESTED": return "CHANGES REQUESTED"
        case "REVIEW_REQUIRED": return "REVIEW REQUIRED"
        default: return "AWAITING REVIEW"
        }
    }

    private func metric(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            flightLabel(label)
            Text(value).font(.flightSans(17, weight: .bold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 82, alignment: .topLeading)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundStyle(FlightDeckPalette.muted)
            Spacer()
            Text(value).foregroundStyle(FlightDeckPalette.text).multilineTextAlignment(.trailing)
        }
        .font(.flightMono(7, weight: .semibold))
    }
}

private func pullRequestSignal(_ count: Int, _ label: String, _ color: Color) -> some View {
    HStack(spacing: 4) {
        Text("\(count)").foregroundStyle(count > 0 ? color : FlightDeckPalette.muted)
        Text(label).foregroundStyle(FlightDeckPalette.muted)
    }
    .font(.flightMono(6, weight: .semibold))
}

private func inboxReason(_ pullRequest: AuthoredPullRequest) -> String {
    if pullRequest.failedCheckCount > 0 {
        return "\(pullRequest.failedCheckCount) failing check\(pullRequest.failedCheckCount == 1 ? "" : "s")"
    }
    if pullRequest.hasUnreadActivity { return "New comments and review activity" }
    return "Pull request update"
}

private func pullRequestStatusLabel(_ pullRequest: AuthoredPullRequest, compact: Bool = false) -> String {
    if pullRequest.isDraft { return "DRAFT" }
    switch pullRequest.reviewDecision {
    case "APPROVED": return "APPROVED"
    case "CHANGES_REQUESTED": return compact ? "CHANGES" : "CHANGES REQUESTED"
    default: return compact ? "READY" : "READY FOR REVIEW"
    }
}

private func pullRequestStatusColor(_ pullRequest: AuthoredPullRequest) -> Color {
    if pullRequest.isDraft { return FlightDeckPalette.secondary }
    return pullRequest.reviewDecision == "CHANGES_REQUESTED" ? FlightDeckPalette.red : FlightDeckPalette.green
}

private func pullRequestMatchingAgent(
    for pullRequest: FlightDeckPullRequest,
    agents: [FlightDeckAgent],
    workspaces: [FlightDeckWorkspace]
) -> FlightDeckAgent? {
    guard let pullRequestPath = pullRequest.pullRequest.worktreePath else { return nil }
    return agents.first { agent in
        guard agent.server.id == pullRequest.server.id else { return false }
        let deepestContainingWorktree = workspaces
            .filter { $0.server.id == agent.server.id }
            .flatMap(\.workspace.worktrees)
            .map(\.path)
            .filter { agent.session.panePath == $0 || agent.session.panePath.hasPrefix($0 + "/") }
            .max { $0.count < $1.count }
        return deepestContainingWorktree == pullRequestPath
    }
}

private func checkColor(_ state: String) -> Color {
    switch state {
    case "pass": return FlightDeckPalette.green
    case "fail": return FlightDeckPalette.red
    case "pending": return FlightDeckPalette.amber
    default: return FlightDeckPalette.muted
    }
}

private func statusPill(_ text: String, _ color: Color) -> some View {
    Text(text)
        .font(.flightMono(7, weight: .bold))
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background(color.opacity(0.08))
        .overlay(Rectangle().stroke(color))
}

private func relativeTimestamp(_ value: String) -> String {
    guard !value.isEmpty else { return "JUST NOW" }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    guard let date else { return value.uppercased() }
    return date.formatted(.relative(presentation: .named)).uppercased()
}

private func tomorrowMorning() -> Date {
    let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date().addingTimeInterval(86_400)
    return Calendar.current.startOfDay(for: nextDay).addingTimeInterval(9 * 60 * 60)
}

private struct FlightDeckTelemetry: View {
    let agent: FlightDeckAgent
    @State private var checks: SessionChecks?
    @State private var links: SessionLinks?
    @State private var conversation: Conversation?
    @Environment(\.openURL) private var openURL

    private var api: APIClient? {
        APIClient(urlString: agent.server.url, token: agent.server.token)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                flightLabel("LIVE TELEMETRY")
                Text("Session integrity")
                    .font(.flightSans(24, weight: .bold))
                Text(agent.session.resolvedState == .needsInput ? "AWAITING COMMAND" : "ALL SYSTEMS NOMINAL")
                    .font(.flightMono(9))
                    .foregroundStyle(stateColor(agent.session.resolvedState))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 23)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    telemetryCard("CONTEXT", agent.session.context.map { "\($0.percent)%" } ?? "—", accent: contextColor)
                    telemetryCard("TURN", turnAge, accent: stateColor(agent.session.resolvedState))
                }
                telemetryRows
            }
            .padding(20)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            pullRequestsSummary
                .padding(20)
                .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            changesSummary
                .padding(20)
                .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            checksSummary
                .padding(20)

            Spacer()
        }
        .background(FlightDeckPalette.chrome)
        .overlay(alignment: .leading) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
        .task(id: agent.id) {
            await pollTelemetry()
        }
    }

    private var contextColor: Color {
        guard let context = agent.session.context else { return FlightDeckPalette.muted }
        if context.isCritical { return FlightDeckPalette.red }
        return FlightDeckPalette.amber
    }

    private func telemetryCard(_ label: String, _ value: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            flightLabel(label)
            Text(value)
                .font(.flightSans(value.count > 6 ? 16 : 22, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if label == "CONTEXT" {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(FlightDeckPalette.border)
                        Rectangle()
                            .fill(accent)
                            .frame(width: geometry.size.width * CGFloat(agent.session.context?.fraction ?? 0))
                    }
                }
                .frame(height: 3)
            } else {
                Text(turnHealth)
                    .font(.flightMono(7))
                    .foregroundStyle(accent)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private var telemetryRows: some View {
        VStack(spacing: 10) {
            telemetryRow("AGENT", (agent.session.agent ?? .shell).displayName.uppercased())
            telemetryRow("MODEL", telemetryModel)
            telemetryRow("WORKTREE", telemetryWorktree)
        }
    }

    @ViewBuilder
    private var pullRequestsSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("OPEN PULL REQUESTS")
                Spacer(minLength: 8)
                Text(String(format: "%02d", links?.resolvedPullRequest == nil ? 0 : 1))
                    .foregroundStyle(FlightDeckPalette.amber)
            }
            .font(.flightMono(7, weight: .semibold))
            .tracking(0.7)
            .foregroundStyle(FlightDeckPalette.muted)

            if let pullRequest = links?.resolvedPullRequest {
                Button {
                    if let url = URL(string: pullRequest.url) { openURL(url) }
                } label: {
                    HStack(spacing: 12) {
                        Text(pullRequest.number > 0 ? "#" + String(pullRequest.number) : "PR")
                            .font(.flightMono(8, weight: .semibold))
                            .foregroundStyle(FlightDeckPalette.amber)
                            .frame(width: 46, height: 32)
                            .background(FlightDeckPalette.amber.opacity(0.10))
                            .overlay(Rectangle().stroke(FlightDeckPalette.amber))

                        VStack(alignment: .leading, spacing: 5) {
                            Text(pullRequest.title)
                                .font(.flightSans(10, weight: .semibold))
                                .foregroundStyle(FlightDeckPalette.text)
                                .lineLimit(1)
                            Text(pullRequestMetadata(pullRequest))
                                .font(.flightMono(7, weight: .medium))
                                .tracking(0.35)
                                .foregroundStyle(FlightDeckPalette.muted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(FlightDeckPalette.amber)
                            .frame(width: 32, height: 32)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
                    .background(FlightDeckPalette.surface)
                    .overlay(Rectangle().stroke(FlightDeckPalette.strongBorder))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Open pull request on GitHub")
            } else if links == nil {
                HStack {
                    ProgressView().tint(FlightDeckPalette.secondary)
                    Text("CHECKING THIS BRANCH")
                        .font(.flightMono(7))
                        .foregroundStyle(FlightDeckPalette.muted)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            } else {
                Text("NO OPEN PULL REQUEST FOR THIS BRANCH")
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var changesSummary: some View {
        let diff = agent.session.diffStat
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("CHANGES / \(String(format: "%02d", diff?.files ?? 0))")
                    .foregroundStyle(FlightDeckPalette.secondary)
                Spacer()
                Text("+\(diff?.adds ?? 0)").foregroundStyle(FlightDeckPalette.green)
                Text("−\(diff?.dels ?? 0)").foregroundStyle(FlightDeckPalette.red)
            }

            if !fileChanges.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(fileChanges.prefix(3).enumerated()), id: \.element.id) { index, change in
                        HStack(spacing: 0) {
                            Text("M")
                                .foregroundStyle(FlightDeckPalette.green)
                                .frame(width: 18, alignment: .leading)
                            Text(basename(change.path))
                                .foregroundStyle(FlightDeckPalette.secondary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Spacer(minLength: 8)
                            Text(changeSummary(change))
                                .foregroundStyle(FlightDeckPalette.secondary)
                        }
                        .padding(.horizontal, 10)
                        .frame(height: 34)
                        .overlay(alignment: .bottom) {
                            if index < min(fileChanges.count, 3) - 1 {
                                Divider().overlay(FlightDeckPalette.border)
                            }
                        }
                    }
                }
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            } else {
                Text(diff == nil ? "NO FILE CHANGES REPORTED" : "LIVE WORKTREE SUMMARY")
                    .foregroundStyle(FlightDeckPalette.muted)
            }
        }
        .font(.flightMono(7))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var checksSummary: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text("CHECKS / \(String(format: "%02d", checks?.checks.count ?? 0))")
                .font(.flightMono(7))
                .foregroundStyle(FlightDeckPalette.secondary)
            if let checks, checks.available, !checks.checks.isEmpty {
                ForEach(checks.checks.prefix(3)) { check in
                    HStack(spacing: 0) {
                        Text(checkGlyph(check.state))
                            .foregroundStyle(checkColor(check.state))
                            .frame(width: 18, alignment: .leading)
                        Text(check.name.uppercased())
                            .foregroundStyle(FlightDeckPalette.text)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text(checkTrailingLabel(check))
                            .foregroundStyle(checkColor(check.state))
                    }
                    .font(.flightMono(7))
                }
            } else {
                Text("NO CHECKS REPORTED")
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private struct FileChange: Identifiable {
        let path: String
        var adds: Int
        var dels: Int
        var id: String { path }
    }

    private var fileChanges: [FileChange] {
        var byFile: [String: FileChange] = [:]
        for entry in conversation?.entries ?? [] where entry.kind == "tool" {
            guard let file = entry.file, (entry.adds ?? 0) > 0 || (entry.dels ?? 0) > 0 else { continue }
            var change = byFile[file] ?? FileChange(path: file, adds: 0, dels: 0)
            change.adds += entry.adds ?? 0
            change.dels += entry.dels ?? 0
            byFile[file] = change
        }
        return byFile.values.sorted { ($0.adds + $0.dels) > ($1.adds + $1.dels) }
    }

    private var telemetryModel: String {
        (conversation?.info?.shortModel ?? conversation?.model ?? agent.session.context?.model ?? "—").uppercased()
    }

    private var telemetryWorktree: String {
        let branch = conversation?.info?.gitBranch
        let fallback = URL(fileURLWithPath: agent.session.panePath).lastPathComponent
        return (branch.flatMap { $0.isEmpty ? nil : $0 } ?? fallback).uppercased()
    }

    private func pullRequestMetadata(_ pullRequest: PullRequestSummary) -> String {
        let branch = pullRequest.headRefName.isEmpty
            ? (conversation?.info?.gitBranch ?? "CURRENT BRANCH")
            : pullRequest.headRefName
        let total = checks?.checks.count ?? 0
        guard total > 0 else { return "\(branch.uppercased()) · NO CHECKS" }
        let passed = checks?.checks.filter { isPassing($0.state) }.count ?? 0
        return "\(branch.uppercased()) · \(passed)/\(total) CHECKS"
    }

    private func basename(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    private func changeSummary(_ change: FileChange) -> String {
        if change.dels == 0 { return "+\(change.adds)" }
        if change.adds == 0 { return "−\(change.dels)" }
        return "+\(change.adds) −\(change.dels)"
    }

    private func isPassing(_ state: String) -> Bool {
        state == "pass" || state == "success"
    }

    private func isPending(_ state: String) -> Bool {
        state == "pending" || state == "in_progress" || state == "queued"
    }

    private func checkGlyph(_ state: String) -> String {
        if isPassing(state) { return "✓" }
        if isPending(state) { return "!" }
        return "×"
    }

    private func checkColor(_ state: String) -> Color {
        if isPassing(state) { return FlightDeckPalette.green }
        if isPending(state) { return FlightDeckPalette.amber }
        return FlightDeckPalette.red
    }

    private func checkTrailingLabel(_ check: CheckRun) -> String {
        if let duration = check.durationSeconds {
            return duration >= 60 ? "\(duration / 60)M" : "\(max(duration, 1))S"
        }
        if isPending(check.state) { return "WAIT" }
        return check.state.uppercased()
    }

    private func pollTelemetry() async {
        while !Task.isCancelled {
            await refreshTelemetry()
            try? await Task.sleep(for: .seconds(20))
        }
    }

    private func refreshTelemetry() async {
        guard let api else { return }
        async let checksResult = try? api.checks(agent.session.name)
        async let linksResult = try? api.links(agent.session.name)
        async let conversationResult = try? api.conversation(agent.session.name)
        checks = await checksResult
        links = await linksResult
        conversation = await conversationResult
    }

    private var turnAge: String {
        let elapsed = max(0, Date().timeIntervalSince(agent.session.lastOutputDate))
        if elapsed < 60 { return "NOW" }
        if elapsed < 3_600 { return String(format: "%02d:%02d", Int(elapsed) / 60, Int(elapsed) % 60) }
        return "\(Int(elapsed / 3_600))H"
    }

    private var turnHealth: String {
        switch agent.session.resolvedState {
        case .working: return "IN FLIGHT"
        case .needsInput: return "WAITING"
        case .idle: return "HEALTHY"
        case .unknown: return "UNKNOWN"
        }
    }

    private func telemetryRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(FlightDeckPalette.muted).frame(width: 96, alignment: .leading)
            Text(value).foregroundStyle(FlightDeckPalette.text).lineLimit(1)
            Spacer(minLength: 0)
        }
        .font(.flightMono(9))
    }
}

private struct FlightDeckLoopsView: View {
    let loops: [FlightDeckLoop]
    let workspaces: [FlightDeckWorkspace]
    let selectedID: String?
    let onSelect: (FlightDeckLoop) -> Void
    let onChanged: () async -> Void
    let onOpenSession: (Server, String) async -> Void

    @EnvironmentObject private var toasts: ToastCenter
    @State private var editingLoop: FlightDeckLoop?
    @State private var showNewLoop = false
    @State private var pendingDelete: FlightDeckLoop?
    @State private var running: Set<String> = []

    private var selected: FlightDeckLoop? {
        loops.first { $0.id == selectedID } ?? loops.first
    }

    var body: some View {
        VStack(spacing: 0) {
            FlightDeckPageHeader(
                eyebrow: "AUTOMATION / RECURRING MISSIONS",
                title: "Loops",
                subtitle: "Scheduled agent runs across every connected device"
            ) {
                Button("+ NEW LOOP") { showNewLoop = true }
                    .buttonStyle(FlightDeckAccentButtonStyle())
            }
            HStack(spacing: 0) {
                loopIndex.frame(width: FlightDeckLayout.indexWidth)
                if let selected {
                    loopDetail(selected)
                } else {
                    FlightDeckEmptyState(
                        title: "No loops configured",
                        detail: "Create a recurring mission, choose a workspace, then run it with Claude or Codex."
                    )
                }
            }
        }
        .background(FlightDeckPalette.background)
        .overlay {
            if showNewLoop {
                FlightDeckModalLayer(onDismiss: { showNewLoop = false }) {
                    FlightDeckLoopEditor(
                        workspaces: workspaces,
                        existing: nil,
                        onCancel: { showNewLoop = false }
                    ) {
                        showNewLoop = false
                        await onChanged()
                    }
                }
            } else if let loop = editingLoop {
                FlightDeckModalLayer(onDismiss: { editingLoop = nil }) {
                    FlightDeckLoopEditor(
                        workspaces: workspaces.filter { $0.server.id == loop.server.id },
                        existing: loop,
                        onCancel: { editingLoop = nil }
                    ) {
                        editingLoop = nil
                        await onChanged()
                    }
                }
            } else if let loop = pendingDelete {
                FlightDeckModalLayer(onDismiss: { pendingDelete = nil }) {
                    FlightDeckDialogModal(
                        eyebrow: "LOOPS / DESTRUCTIVE ACTION",
                        title: "Delete loop?",
                        message: "Future runs stop immediately. Sessions already launched by this loop are not deleted."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("CANCEL") { pendingDelete = nil }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        Button("DELETE \(loop.loop.name.uppercased())") {
                            pendingDelete = nil
                            Task { await delete(loop) }
                        }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                    }
                }
            }
        }
    }

    private var loopIndex: some View {
        VStack(spacing: 0) {
            HStack {
                flightLabel("ACTIVE / \(String(format: "%02d", loops.filter { $0.loop.enabled }.count))")
                Spacer()
                flightLabel("NEXT 24 HOURS")
            }
            .padding(.horizontal, 22)
            .frame(height: 46)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(loops) { loop in loopRow(loop) }
                }
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .trailing) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private func loopRow(_ loop: FlightDeckLoop) -> some View {
        let isSelected = selected?.id == loop.id
        return Button { onSelect(loop) } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Rectangle()
                        .fill(loop.loop.enabled ? (loop.loop.lastError == nil ? FlightDeckPalette.green : FlightDeckPalette.red) : FlightDeckPalette.muted)
                        .frame(width: 8, height: 8)
                    Text(loop.loop.name)
                        .font(.flightSans(15, weight: .semibold))
                        .lineLimit(1)
                    Spacer()
                    Text(loopStatus(loop))
                        .font(.flightMono(8))
                        .foregroundStyle(loop.loop.lastError == nil ? FlightDeckPalette.green : FlightDeckPalette.red)
                }
                Text(loop.loop.schedule.summary)
                    .font(.flightSans(11))
                    .foregroundStyle(FlightDeckPalette.secondary)
                HStack(spacing: 8) {
                    Text(loop.deviceCode)
                        .padding(.horizontal, 10)
                        .frame(height: 18)
                        .overlay(Rectangle().stroke(FlightDeckPalette.border))
                    Menu {
                        agentButton(.codex, loop: loop)
                        agentButton(.claude, loop: loop)
                    } label: {
                        Text("\(loop.loop.agent.displayName.uppercased())  ⌄")
                            .padding(.horizontal, 10)
                            .frame(height: 22)
                            .overlay(Rectangle().stroke(FlightDeckPalette.border))
                    }
                    .menuStyle(.borderlessButton)
                    Spacer()
                    Text("NEXT \(relativeRunLabel(loop.loop.nextRunDate))")
                        .foregroundStyle(FlightDeckPalette.muted)
                }
                .font(.flightMono(8))
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .frame(height: 117)
            .foregroundStyle(isSelected ? FlightDeckPalette.text : FlightDeckPalette.secondary)
        }
        .flightDeckIndexRow(selected: isSelected)
    }

    private func loopDetail(_ selected: FlightDeckLoop) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 7) {
                    flightLabel("SELECTED LOOP")
                    Text(selected.loop.name)
                        .font(.flightSans(24, weight: .bold))
                }
                Spacer()
                VStack(alignment: .leading, spacing: 6) {
                    flightLabel("RUN WITH")
                    Menu {
                        agentButton(.codex, loop: selected)
                        agentButton(.claude, loop: selected)
                    } label: {
                        HStack {
                            Text(selected.loop.agent.displayName.uppercased())
                            Spacer()
                            Text("⌄")
                        }
                        .font(.flightMono(10, weight: .semibold))
                        .foregroundStyle(FlightDeckPalette.text)
                        .padding(.horizontal, 12)
                        .frame(width: 124, height: 32)
                        .overlay(Rectangle().stroke(FlightDeckPalette.border))
                    }
                    .menuStyle(.borderlessButton)
                }
            }
            .frame(height: 78)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            HStack(spacing: 10) {
                loopMetric("RUNS", "\(selected.loop.runs)", "\(selected.loop.successPercent)% SUCCESS")
                loopMetric(
                    "LAST RUN",
                    selected.loop.lastDurationMs.map { durationLabel($0) } ?? "—",
                    selected.loop.lastRunDate?.formatted(date: .abbreviated, time: .shortened).uppercased() ?? "NOT RUN YET"
                )
                loopMetric(
                    "NEXT RUN",
                    selected.loop.nextRunDate.formatted(date: .omitted, time: .shortened),
                    relativeRunLabel(selected.loop.nextRunDate),
                    accent: FlightDeckPalette.amber
                )
            }

            VStack(alignment: .leading, spacing: 10) {
                flightLabel("MISSION")
                Text(selected.loop.prompt)
                    .font(.flightMono(12))
                    .foregroundStyle(FlightDeckPalette.secondary)
                    .padding(18)
                    .frame(maxWidth: .infinity, minHeight: 82, alignment: .topLeading)
                    .background(FlightDeckPalette.surface)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }

            HStack(spacing: 8) {
                Button(running.contains(selected.id) ? "RUNNING…" : "RUN NOW ↵") {
                    Task { await run(selected) }
                }
                .buttonStyle(FlightDeckAccentButtonStyle())
                .disabled(running.contains(selected.id))
                Button("EDIT LOOP") { editingLoop = selected }
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                Button(selected.loop.enabled ? "PAUSE" : "RESUME") {
                    Task { await setEnabled(selected, !selected.loop.enabled) }
                }
                .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                Spacer()
                Button("DELETE") { pendingDelete = selected }
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
            }
            if let error = selected.loop.lastError, !error.isEmpty {
                Text(error)
                    .font(.flightMono(9))
                    .foregroundStyle(FlightDeckPalette.red)
            }
            Spacer()
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func loopMetric(_ label: String, _ value: String, _ footer: String, accent: Color = FlightDeckPalette.green) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            flightLabel(label)
            Text(value).font(.flightSans(26, weight: .bold)).lineLimit(1)
            Text(footer).font(.flightMono(8)).foregroundStyle(accent).lineLimit(1)
        }
        .padding(18)
        .frame(maxWidth: 170, minHeight: 104, alignment: .topLeading)
        .background(FlightDeckPalette.surface)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    @ViewBuilder
    private func agentButton(_ agent: AgentKind, loop: FlightDeckLoop) -> some View {
        Button {
            Task { await setAgent(agent, for: loop) }
        } label: {
            Label(agent.displayName, systemImage: loop.loop.agent == agent ? "checkmark" : agent.systemImage)
        }
    }

    private func setAgent(_ agent: AgentKind, for loop: FlightDeckLoop) async {
        guard agent != .shell,
              let api = APIClient(urlString: loop.server.url, token: loop.server.token) else { return }
        do {
            try await api.updateLoop(id: loop.loop.id, agent: agent)
            await onChanged()
        } catch {
            toasts.show(.error, "Couldn't change loop agent")
        }
    }

    private func setEnabled(_ loop: FlightDeckLoop, _ enabled: Bool) async {
        guard let api = APIClient(urlString: loop.server.url, token: loop.server.token) else { return }
        do {
            try await api.updateLoop(id: loop.loop.id, enabled: enabled)
            await onChanged()
        } catch {
            toasts.show(.error, "Couldn't update loop")
        }
    }

    private func run(_ loop: FlightDeckLoop) async {
        guard let api = APIClient(urlString: loop.server.url, token: loop.server.token) else { return }
        running.insert(loop.id)
        defer { running.remove(loop.id) }
        do {
            let result = try await api.runLoop(id: loop.loop.id)
            await onChanged()
            await onOpenSession(loop.server, result.session)
            toasts.show(.success, "Started \(loop.loop.name)")
        } catch {
            toasts.show(.error, "Loop failed: \(error.localizedDescription)")
            await onChanged()
        }
    }

    private func delete(_ loop: FlightDeckLoop) async {
        guard let api = APIClient(urlString: loop.server.url, token: loop.server.token) else { return }
        do {
            try await api.deleteLoop(id: loop.loop.id)
            await onChanged()
            toasts.show(.success, "Deleted \(loop.loop.name)")
        } catch {
            toasts.show(.error, "Couldn't delete loop")
        }
    }

    private var deletePresented: Binding<Bool> {
        Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })
    }

    private func loopStatus(_ loop: FlightDeckLoop) -> String {
        if !loop.loop.enabled { return "PAUSED" }
        if running.contains(loop.id) { return "RUNNING" }
        return loop.loop.lastError == nil ? "HEALTHY" : "FAILED"
    }

    private func durationLabel(_ milliseconds: TimeInterval) -> String {
        if milliseconds < 1_000 { return "<1s" }
        if milliseconds < 60_000 { return "\(Int(milliseconds / 1_000))s" }
        return "\(Int(milliseconds / 60_000))m"
    }

    private func relativeRunLabel(_ date: Date) -> String {
        let seconds = max(date.timeIntervalSinceNow, 0)
        if seconds < 60 { return "NOW" }
        let minutes = Int((seconds / 60).rounded())
        if minutes < 60 { return "IN \(minutes)M" }
        let hours = Int((seconds / 3_600).rounded())
        if hours < 24 { return "IN \(hours)H" }
        let days = Int((seconds / 86_400).rounded())
        return "IN \(days)D"
    }
}

private struct FlightDeckLoopEditor: View {
    let workspaces: [FlightDeckWorkspace]
    let existing: FlightDeckLoop?
    let onCancel: () -> Void
    let onSaved: () async -> Void

    @State private var name: String
    @State private var workspaceID: String
    @State private var agent: AgentKind
    @State private var frequency: LoopFrequency
    @State private var intervalHours: Int
    @State private var runTime: Date
    @State private var weekday: Int
    @State private var prompt: String
    @State private var saving = false
    @State private var errorText: String?

    init(
        workspaces: [FlightDeckWorkspace],
        existing: FlightDeckLoop?,
        onCancel: @escaping () -> Void,
        onSaved: @escaping () async -> Void
    ) {
        self.workspaces = workspaces
        self.existing = existing
        self.onCancel = onCancel
        self.onSaved = onSaved
        let schedule = existing?.loop.schedule
        _name = State(initialValue: existing?.loop.name ?? "")
        _workspaceID = State(initialValue: existing?.loop.workspaceId ?? workspaces.first?.workspace.id ?? "")
        _agent = State(initialValue: existing?.loop.agent ?? .codex)
        _frequency = State(initialValue: schedule?.frequency ?? .daily)
        _intervalHours = State(initialValue: schedule?.intervalHours ?? 2)
        _weekday = State(initialValue: schedule?.weekday ?? 1)
        _prompt = State(initialValue: existing?.loop.prompt ?? "")
        var components = DateComponents()
        components.hour = schedule?.hour ?? 9
        components.minute = schedule?.minute ?? 0
        _runTime = State(initialValue: Calendar.current.date(from: components) ?? .now)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FlightDeckModalHeader(
                eyebrow: "LOOPS / \(existing == nil ? "NEW MISSION" : "EDIT MISSION")",
                title: existing == nil ? "Create a loop" : "Edit loop",
                onCancel: onCancel
            )

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    loopField("LOOP NAME") {
                        TextField("Name", text: $name)
                            .textFieldStyle(FlightDeckTextFieldStyle())
                    }

                    HStack(alignment: .top, spacing: 18) {
                        loopField("WORKSPACE") {
                            flightPicker {
                                Picker("Workspace", selection: $workspaceID) {
                                    ForEach(workspaces) { workspace in
                                        Text("\(workspace.workspace.name) · \(workspace.deviceCode)").tag(workspace.workspace.id)
                                    }
                                }
                            }
                        }
                        loopField("RUN WITH") {
                            HStack(spacing: 0) {
                                agentButton(.codex)
                                agentButton(.claude)
                            }
                        }
                    }

                    HStack(alignment: .top, spacing: 18) {
                        loopField("FREQUENCY") {
                            flightPicker {
                                Picker("Frequency", selection: $frequency) {
                                    ForEach(LoopFrequency.allCases) { item in
                                        Text(item.displayName).tag(item)
                                    }
                                }
                            }
                        }
                        loopField("SCHEDULE") {
                            HStack(spacing: 12) {
                                if frequency == .hourly {
                                    Stepper(
                                        "Every \(intervalHours) hour\(intervalHours == 1 ? "" : "s")",
                                        value: $intervalHours,
                                        in: 1...168
                                    )
                                    .font(.flightSans(10))
                                } else {
                                    if frequency == .weekly {
                                        Picker("Day", selection: $weekday) {
                                            ForEach(Array(Calendar.current.weekdaySymbols.enumerated()), id: \.offset) { index, day in
                                                Text(day).tag(index)
                                            }
                                        }
                                        .labelsHidden()
                                    }
                                    DatePicker("Time", selection: $runTime, displayedComponents: .hourAndMinute)
                                        .labelsHidden()
                                }
                            }
                            .tint(FlightDeckPalette.amber)
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
                            .background(FlightDeckPalette.surface)
                            .overlay(Rectangle().stroke(FlightDeckPalette.border))
                        }
                    }

                    loopField("MISSION PROMPT") {
                        TextEditor(text: $prompt)
                            .font(.flightMono(10))
                            .foregroundStyle(FlightDeckPalette.text)
                            .scrollContentBackground(.hidden)
                            .padding(10)
                            .frame(minHeight: 150)
                            .background(FlightDeckPalette.surface)
                            .overlay(Rectangle().stroke(FlightDeckPalette.border))
                    }

                    if let errorText {
                        Text(errorText)
                            .font(.flightSans(10))
                            .foregroundStyle(FlightDeckPalette.red)
                    }
                }
                .padding(24)
            }

            HStack(spacing: 10) {
                Spacer()
                Button("CANCEL", action: onCancel)
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                Button(saving ? "SAVING…" : "SAVE LOOP") { Task { await save() } }
                    .buttonStyle(FlightDeckAccentButtonStyle())
                    .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty || workspaceID.isEmpty || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(18)
            .background(FlightDeckPalette.surface)
            .overlay(alignment: .top) { Divider().overlay(FlightDeckPalette.border) }
        }
        .frame(width: 720, height: 700)
        .preferredColorScheme(.dark)
    }

    private func loopField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.flightMono(8, weight: .bold))
                .foregroundStyle(FlightDeckPalette.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func flightPicker<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .labelsHidden()
            .pickerStyle(.menu)
            .tint(FlightDeckPalette.amber)
            .font(.flightSans(10))
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
            .background(FlightDeckPalette.surface)
            .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }

    private func agentButton(_ kind: AgentKind) -> some View {
        Button { agent = kind } label: {
            Text(kind.displayName.uppercased())
                .font(.flightMono(9, weight: .semibold))
                .foregroundStyle(agent == kind ? FlightDeckPalette.onAccent : FlightDeckPalette.secondary)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(agent == kind ? FlightDeckPalette.amber : FlightDeckPalette.surface)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
        }
        .buttonStyle(.plain)
    }

    private func save() async {
        guard !saving,
              let workspace = workspaces.first(where: { $0.workspace.id == workspaceID }),
              let api = APIClient(urlString: workspace.server.url, token: workspace.server.token) else { return }
        saving = true
        defer { saving = false }
        let time = Calendar.current.dateComponents([.hour, .minute], from: runTime)
        let schedule = LoopSchedule(
            frequency: frequency,
            intervalHours: frequency == .hourly ? intervalHours : nil,
            hour: frequency == .hourly ? nil : time.hour,
            minute: frequency == .hourly ? nil : time.minute,
            weekday: frequency == .weekly ? weekday : nil
        )
        do {
            if let existing {
                try await api.updateLoop(
                    id: existing.loop.id,
                    name: name,
                    workspaceID: workspaceID,
                    prompt: prompt,
                    agent: agent,
                    schedule: schedule
                )
            } else {
                try await api.createLoop(
                    name: name,
                    workspaceID: workspaceID,
                    prompt: prompt,
                    agent: agent,
                    schedule: schedule
                )
            }
            await onSaved()
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private struct FlightDeckConnectionsView: View {
    let addRequest: Int
    let serverErrors: [String: String]
    let checkedServerIDs: Set<String>

    @ObservedObject private var store = ServerStore.shared
    @EnvironmentObject private var toasts: ToastCenter
    @AppStorage("localDeviceServerID") private var localDeviceServerID = ""

    @State private var name = ""
    @State private var deviceID = ""
    @State private var url = ""
    @State private var token = ""
    @State private var adding = false
    @State private var testing = false
    @State private var health: ConnectionHealth = .unknown
    @State private var pendingRemoval: Server?
    @State private var pasteFailed = false
    @State private var showUpdateConfirmation = false
    @State private var updating = false
    @State private var showAddOptions = false
    @State private var localSetupState: FlightDeckLocalSetupState?
    @State private var sharingServer: Server?

    private enum ConnectionHealth {
        case unknown, checking, online, offline

        var label: String {
            switch self {
            case .unknown: return "NOT CHECKED"
            case .checking: return "CHECKING"
            case .online: return "CONNECTED"
            case .offline: return "OFFLINE"
            }
        }

        var color: Color {
            switch self {
            case .online: return FlightDeckPalette.green
            case .checking: return FlightDeckPalette.amber
            case .unknown: return FlightDeckPalette.muted
            case .offline: return FlightDeckPalette.red
            }
        }
    }

    private var selected: Server? {
        guard !adding else { return nil }
        return store.active ?? store.servers.first
    }

    var body: some View {
        VStack(spacing: 0) {
            FlightDeckPageHeader(
                eyebrow: "FLEET / SECURE LINKS",
                title: "Connection settings",
                subtitle: "Pair, identify, and maintain every Mission Control device"
            ) {
                HStack(spacing: 10) {
                    Button("PASTE PAIRING LINK", action: pastePairingLink)
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                    Button("+ ADD DEVICE") { showAddOptions = true }
                        .buttonStyle(FlightDeckAccentButtonStyle())
                }
            }

            HStack(spacing: 0) {
                deviceIndex.frame(width: FlightDeckLayout.indexWidth)
                connectionForm.frame(minWidth: 480, maxWidth: .infinity)
                connectionInspector.frame(width: 300)
            }
        }
        .background(FlightDeckPalette.background)
        .onAppear {
            loadSelected()
            if addRequest > 0 { showAddOptions = true }
        }
        .onChange(of: addRequest) { _, request in
            if request > 0 { showAddOptions = true }
        }
        .onChange(of: store.activeID) { _, _ in loadSelected() }
        .onChange(of: selectedFleetHealth) { _, newHealth in
            if !testing && !adding { health = newHealth }
        }
        .overlay {
            if let server = sharingServer {
                FlightDeckModalLayer(onDismiss: { sharingServer = nil }) {
                    FlightDeckPairingShareView(
                        server: server,
                        onClose: { sharingServer = nil }
                    )
                }
            } else if showAddOptions || localSetupState != nil {
                FlightDeckModalLayer(onDismiss: {
                    showAddOptions = false
                    if localSetupState?.canDismiss == true { localSetupState = nil }
                }, dismissOnBackdrop: localSetupState?.canDismiss ?? true) {
                    if let localSetupState {
                        FlightDeckLocalSetupView(
                            state: localSetupState,
                            onClose: { self.localSetupState = nil },
                            onRetry: startLocalDeviceSetup
                        )
                    } else {
                        FlightDeckAddDeviceOptions(
                            canSetUpThisMac: !localDeviceConfigured,
                            onCancel: { showAddOptions = false },
                            onConnectExisting: {
                                showAddOptions = false
                                beginAdd()
                            },
                            onSetUpThisMac: startLocalDeviceSetup
                        )
                    }
                }
            } else if let server = pendingRemoval {
                FlightDeckModalLayer(onDismiss: { pendingRemoval = nil }) {
                    FlightDeckDialogModal(
                        eyebrow: "FLEET / DEVICE REMOVAL",
                        title: "Remove device?",
                        message: "Mission Control will forget \(server.name). The server and its running sessions are not stopped."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("CANCEL") { pendingRemoval = nil }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        Button("REMOVE \(server.name.uppercased())") {
                            pendingRemoval = nil
                            store.remove(server.id)
                            if localDeviceServerID == server.id { localDeviceServerID = "" }
                            loadSelected()
                        }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                    }
                }
            } else if showUpdateConfirmation {
                FlightDeckModalLayer(onDismiss: { showUpdateConfirmation = false }) {
                    FlightDeckDialogModal(
                        eyebrow: "FLEET / SERVER UPDATE",
                        title: "Update selected server?",
                        message: "Running tmux sessions are preserved while the Mission Control service restarts."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("CANCEL") { showUpdateConfirmation = false }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        Button("PULL, BUILD & RESTART") {
                            showUpdateConfirmation = false
                            Task { await updateServer() }
                        }
                        .buttonStyle(FlightDeckAccentButtonStyle())
                    }
                }
            } else if pasteFailed {
                FlightDeckModalLayer(onDismiss: { pasteFailed = false }) {
                    FlightDeckDialogModal(
                        eyebrow: "FLEET / PAIRING LINK",
                        title: "No pairing link found",
                        message: "Copy the missioncontrol://configure link printed by the setup script, then try again."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("OK") { pasteFailed = false }
                            .buttonStyle(FlightDeckAccentButtonStyle())
                    }
                }
            }
        }
    }

    private var deviceIndex: some View {
        VStack(spacing: 0) {
            HStack {
                flightLabel("DEVICES / \(String(format: "%02d", store.servers.count))")
                Spacer()
                flightLabel("FLEET")
            }
            .padding(.horizontal, 20)
            .frame(height: 54)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(store.servers) { server in
                        let rowHealth = connectionHealth(for: server)
                        Button {
                            adding = false
                            store.activeID = server.id
                        } label: {
                            HStack(spacing: 12) {
                                Rectangle()
                                    .fill(rowHealth.color)
                                    .frame(width: 8, height: 8)
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(server.name)
                                        .font(.flightSans(14, weight: .semibold))
                                        .lineLimit(1)
                                    Text("\(server.flightDeckCode) · \(hostLabel(server.url))")
                                        .font(.flightMono(7))
                                        .foregroundStyle(FlightDeckPalette.muted)
                                        .lineLimit(1)
                                }
                                Spacer()
                                if server.id == store.activeID {
                                    Text("ACTIVE")
                                        .font(.flightMono(7, weight: .bold))
                                        .foregroundStyle(FlightDeckPalette.amber)
                                }
                            }
                            .foregroundStyle(server.id == store.activeID && !adding ? FlightDeckPalette.text : FlightDeckPalette.secondary)
                            .padding(.horizontal, 18)
                            .frame(height: 72)
                        }
                        .flightDeckIndexRow(selected: server.id == store.activeID && !adding)
                    }
                }
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .trailing) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private var connectionForm: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                flightLabel(adding ? "NEW SECURE LINK" : "SELECTED DEVICE / \(selected?.flightDeckCode ?? "—")")
                Text(adding ? "Add a device" : (selected?.name ?? "No device selected"))
                    .font(.flightSans(22, weight: .bold))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 18)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            connectionField("DEVICE NAME", placeholder: "My MacBook Pro", text: $name)
            connectionField(
                "DEVICE ID",
                placeholder: selected?.flightDeckCode ?? "MP",
                text: $deviceID
            )
            connectionField("SERVER URL", placeholder: "https://device.tailnet.ts.net", text: $url)

            VStack(alignment: .leading, spacing: 8) {
                flightLabel("ACCESS TOKEN")
                SecureField("Required", text: $token)
                    .textContentType(.password)
                    .font(.flightMono(11))
                    .foregroundStyle(FlightDeckPalette.text)
                    .padding(.horizontal, 13)
                    .frame(height: 42)
                    .background(FlightDeckPalette.surface)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
            }

            HStack(spacing: 10) {
                Button(testing ? "TESTING…" : "TEST CONNECTION") { Task { await testConnection() } }
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: health.color))
                    .disabled(testing || !validForm)
                Button(adding ? "ADD DEVICE" : "SAVE CHANGES", action: save)
                    .buttonStyle(FlightDeckAccentButtonStyle())
                    .disabled(!validForm)
                if adding {
                    Button("CANCEL") { adding = false; loadSelected() }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                }
            }

            Spacer()
        }
        .padding(28)
    }

    private var connectionInspector: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel("CONNECTION STATUS")
                Text(health.label)
                    .font(.flightSans(21, weight: .bold))
                    .foregroundStyle(health.color)
                HStack(spacing: 7) {
                    Rectangle().fill(health.color).frame(width: 7, height: 7)
                    Text(health == .online ? "SECURE LINK VERIFIED" : "VERIFY BEFORE OPERATING")
                        .font(.flightMono(7))
                        .foregroundStyle(FlightDeckPalette.secondary)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(spacing: 0) {
                connectionMetric("DEVICE ID", selected?.flightDeckCode ?? "—")
                connectionMetric("HOST", selected.map { hostLabel($0.url) } ?? "—")
                connectionMetric("ROLE", selected?.id == store.activeID ? "ACTIVE" : "STANDBY")
            }
            .padding(.horizontal, 20)

            Spacer()

            if let selected, !adding {
                VStack(spacing: 10) {
                    Button("SHARE DEVICE SETUP") { sharingServer = selected }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.amber))
                    Button(updating ? "UPDATING…" : "UPDATE SERVER") { showUpdateConfirmation = true }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        .disabled(updating)
                    Button("REMOVE DEVICE") { pendingRemoval = selected }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                }
                .padding(20)
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .leading) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private var validForm: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        URL(string: url) != nil && !token.isEmpty
    }

    private var localDeviceConfigured: Bool {
        !localDeviceServerID.isEmpty && store.servers.contains { $0.id == localDeviceServerID }
    }

    private func connectionField(_ label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            flightLabel(label)
            TextField(placeholder, text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.flightMono(11))
                .foregroundStyle(FlightDeckPalette.text)
                .padding(.horizontal, 13)
                .frame(height: 42)
                .background(FlightDeckPalette.surface)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
        }
    }

    private func connectionMetric(_ label: String, _ value: String) -> some View {
        HStack {
            flightLabel(label)
            Spacer(minLength: 8)
            Text(value).font(.flightMono(8)).foregroundStyle(FlightDeckPalette.secondary).lineLimit(1)
        }
        .frame(height: 42)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private func beginAdd() {
        adding = true
        name = ""
        deviceID = ""
        url = ""
        token = ""
        health = .unknown
    }

    private func loadSelected() {
        guard let server = selected else {
            name = ""
            deviceID = ""
            url = ""
            token = ""
            health = .unknown
            return
        }
        name = server.name
        deviceID = server.deviceID ?? ""
        url = server.url
        token = server.token
        health = selectedFleetHealth
    }

    private func save() {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanDeviceID = normalizedDeviceID
        let cleanURL = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if adding {
            store.addOrUpdate(url: cleanURL, token: token, name: cleanName, deviceID: cleanDeviceID)
            adding = false
            toasts.show(.success, "Added \(cleanName)")
            Task { await testConnection() }
        } else if let selected {
            store.update(selected.id, name: cleanName, url: cleanURL, token: token, deviceID: cleanDeviceID)
            toasts.show(.success, "Saved connection settings")
        }
    }

    private func pastePairingLink() {
        let text = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard let config = PairingConfig(fromString: text) else {
            pasteFailed = true
            return
        }
        let server = store.addOrUpdate(url: config.url, token: config.token)
        adding = false
        store.activeID = server.id
        loadSelected()
        Task { await testConnection() }
    }

    private func startLocalDeviceSetup() {
        guard localSetupState?.isRunning != true else { return }
        showAddOptions = false
        localSetupState = .installing
        Task {
            do {
                let config = try await LocalDeviceSetup.install()
                pairLocalDevice(config)
                localSetupState = nil
                toasts.show(.success, "This Mac is ready")
            } catch {
                localSetupState = .failed(error.localizedDescription)
            }
        }
    }

    private func pairLocalDevice(_ config: PairingConfig) {
        let server = store.addOrUpdate(
            url: config.url,
            token: config.token,
            name: UIDevice.current.name
        )
        localDeviceServerID = server.id
        adding = false
        store.activeID = server.id
        loadSelected()
        Task { await testConnection() }
    }

    private func testConnection() async {
        guard let api = APIClient(urlString: url, token: token) else { return }
        testing = true
        health = .checking
        defer { testing = false }
        do {
            try await api.health()
            health = .online
        } catch {
            health = .offline
        }
    }

    private var selectedFleetHealth: ConnectionHealth {
        selected.map(connectionHealth(for:)) ?? .unknown
    }

    private var normalizedDeviceID: String? {
        let trimmed = deviceID.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(8)).uppercased()
    }

    private func connectionHealth(for server: Server) -> ConnectionHealth {
        guard checkedServerIDs.contains(server.id) else { return .unknown }
        return serverErrors[server.id] == nil ? .online : .offline
    }

    private func updateServer() async {
        guard let selected,
              let api = APIClient(urlString: selected.url, token: selected.token) else { return }
        updating = true
        defer { updating = false }
        do {
            let started = try await api.startServerUpdate()
            toasts.show(.info, started.message)
        } catch {
            toasts.show(.error, "Couldn't start the server update")
        }
    }

    private func hostLabel(_ value: String) -> String {
        URLComponents(string: value)?.host?.uppercased() ?? value.uppercased()
    }

    private var removalPresented: Binding<Bool> {
        Binding(get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } })
    }
}

private struct FlightDeckPairingShareView: View {
    let server: Server
    let onClose: () -> Void

    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    flightLabel("FLEET / SHARE SECURE LINK")
                    Text("Set up another device")
                        .font(.flightSans(24, weight: .bold))
                }
                Spacer()
                Button("CLOSE", action: onClose)
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
            }
            .padding(24)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            HStack(alignment: .top, spacing: 26) {
                PairingQRCodeView(
                    pairingLink: server.pairingLink,
                    accessibilityName: server.name
                )
                .frame(width: 230, height: 230)
                .clipShape(Rectangle())

                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        flightLabel("DEVICE / \(server.flightDeckCode)")
                        Text(server.name)
                            .font(.flightSans(18, weight: .bold))
                        Text(server.url)
                            .font(.flightMono(8))
                            .foregroundStyle(FlightDeckPalette.secondary)
                            .textSelection(.enabled)
                    }

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "lock.shield")
                            .foregroundStyle(FlightDeckPalette.amber)
                        Text("THIS QR CODE AND LINK CONTAIN THE SERVER ACCESS TOKEN. ONLY SHARE THEM WITH A DEVICE YOU TRUST.")
                            .font(.flightMono(8, weight: .semibold))
                            .foregroundStyle(FlightDeckPalette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(14)
                    .background(FlightDeckPalette.raised)
                    .overlay(Rectangle().stroke(FlightDeckPalette.amber))

                    Button(copied ? "PAIRING LINK COPIED" : "COPY PAIRING LINK", action: copyPairingLink)
                        .buttonStyle(FlightDeckAccentButtonStyle())
                        .disabled(server.pairingLink.isEmpty)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(24)
        }
        .frame(width: 680)
        .background(FlightDeckPalette.background)
        .overlay(Rectangle().stroke(FlightDeckPalette.strongBorder))
        .shadow(color: .black.opacity(0.5), radius: 30, y: 18)
        .preferredColorScheme(.dark)
    }

    private func copyPairingLink() {
        UIPasteboard.general.string = server.pairingLink
        copied = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            copied = false
        }
    }
}

private struct FlightDeckAddDeviceOptions: View {
    let canSetUpThisMac: Bool
    let onCancel: () -> Void
    let onConnectExisting: () -> Void
    let onSetUpThisMac: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    flightLabel("FLEET / NEW CONNECTION")
                    Text("Add a device")
                        .font(.flightSans(24, weight: .bold))
                }
                Spacer()
                Button("CANCEL", action: onCancel)
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
            }
            .padding(24)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(spacing: 12) {
                option(
                    icon: "link",
                    title: "CONNECT AN EXISTING DEVICE",
                    detail: "Paste its pairing link or enter the server address and token manually.",
                    accent: false,
                    action: onConnectExisting
                )
                if canSetUpThisMac {
                    option(
                        icon: "laptopcomputer",
                        title: "SET UP THIS MAC",
                        detail: "Install the Mission Control service and agent hooks on the Mac you are using now.",
                        accent: true,
                        action: onSetUpThisMac
                    )
                }
            }
            .padding(24)
        }
        .frame(width: 600)
        .background(FlightDeckPalette.background)
        .overlay(Rectangle().stroke(FlightDeckPalette.strongBorder))
        .shadow(color: .black.opacity(0.5), radius: 30, y: 18)
        .preferredColorScheme(.dark)
    }

    private func option(
        icon: String,
        title: String,
        detail: String,
        accent: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(accent ? FlightDeckPalette.amber : FlightDeckPalette.secondary)
                    .frame(width: 42, height: 42)
                    .overlay(Rectangle().stroke(accent ? FlightDeckPalette.amber : FlightDeckPalette.border))
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.flightMono(9, weight: .bold))
                        .foregroundStyle(accent ? FlightDeckPalette.amber : FlightDeckPalette.text)
                    Text(detail)
                        .font(.flightSans(11))
                        .foregroundStyle(FlightDeckPalette.secondary)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 12)
                Image(systemName: "arrow.right")
                    .foregroundStyle(accent ? FlightDeckPalette.amber : FlightDeckPalette.secondary)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 86)
            .background(accent ? FlightDeckPalette.raised : FlightDeckPalette.surface)
            .overlay(Rectangle().stroke(accent ? FlightDeckPalette.amber : FlightDeckPalette.border))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private enum FlightDeckLocalSetupState: Equatable {
    case installing
    case failed(String)

    var isRunning: Bool {
        if case .installing = self { return true }
        return false
    }

    var canDismiss: Bool { !isRunning }
}

private struct FlightDeckLocalSetupView: View {
    let state: FlightDeckLocalSetupState
    let onClose: () -> Void
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    flightLabel("LOCAL DEVICE / INSTALL")
                    Text(state.isRunning ? "Setting up this Mac" : "Setup needs attention")
                        .font(.flightSans(24, weight: .bold))
                }
                Spacer()
                if state.canDismiss {
                    Button("CLOSE", action: onClose)
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                }
            }
            .padding(24)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(alignment: .leading, spacing: 20) {
                switch state {
                case .installing:
                    HStack(spacing: 18) {
                        ProgressView()
                            .controlSize(.large)
                            .tint(FlightDeckPalette.amber)
                        VStack(alignment: .leading, spacing: 7) {
                            Text("INSTALLING · STARTING SERVICE · PAIRING")
                                .font(.flightMono(9, weight: .bold))
                                .foregroundStyle(FlightDeckPalette.amber)
                            Text("Mission Control is handling the checkout, installer, and secure connection automatically. This can take a few minutes the first time.")
                                .font(.flightSans(12))
                                .foregroundStyle(FlightDeckPalette.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(FlightDeckPalette.raised)
                    .overlay(Rectangle().stroke(FlightDeckPalette.amber))

                    HStack(spacing: 10) {
                        setupStatus("01", "CHECKOUT", "AUTOMATIC")
                        setupStatus("02", "SERVICE", "INSTALLING")
                        setupStatus("03", "PAIRING", "AUTOMATIC")
                    }

                    Text("Keep Mission Control open while setup finishes.")
                        .font(.flightMono(8))
                        .foregroundStyle(FlightDeckPalette.muted)

                case .failed(let message):
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle")
                            Text("LOCAL SETUP DID NOT FINISH")
                                .font(.flightMono(9, weight: .bold))
                        }
                        .foregroundStyle(FlightDeckPalette.red)
                        Text(message)
                            .font(.flightSans(12))
                            .foregroundStyle(FlightDeckPalette.secondary)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(FlightDeckPalette.surface)
                    .overlay(Rectangle().stroke(FlightDeckPalette.red))

                    HStack(spacing: 10) {
                        Button("CLOSE", action: onClose)
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        Button("TRY AGAIN", action: onRetry)
                            .buttonStyle(FlightDeckAccentButtonStyle())
                    }
                }
            }
            .padding(24)
        }
        .frame(width: 640)
        .background(FlightDeckPalette.background)
        .overlay(Rectangle().stroke(FlightDeckPalette.strongBorder))
        .shadow(color: .black.opacity(0.5), radius: 30, y: 18)
        .preferredColorScheme(.dark)
    }

    private func setupStatus(_ number: String, _ title: String, _ status: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(number)
                .font(.flightMono(8, weight: .bold))
                .foregroundStyle(FlightDeckPalette.amber)
            Text(title)
                .font(.flightSans(12, weight: .semibold))
            Text(status)
                .font(.flightMono(7, weight: .bold))
                .foregroundStyle(FlightDeckPalette.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FlightDeckPalette.surface)
        .overlay(Rectangle().stroke(FlightDeckPalette.border))
    }
}

private enum LocalDeviceSetup {
    private struct SetupError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static func install() async throws -> PairingConfig {
        try await Task.detached(priority: .userInitiated) {
            let repository = try repositoryPath()
            try runSetup(in: repository)
            return try pairingConfig()
        }.value
    }

    private static func repositoryPath() throws -> URL {
        let fileManager = FileManager.default
        let environment = ProcessInfo.processInfo.environment
        guard let homePath = environment["HOME"], !homePath.isEmpty else {
            throw SetupError(message: "Mission Control could not locate your home directory.")
        }
        let home = URL(fileURLWithPath: homePath, isDirectory: true)
        let configured = environment["MISSION_CONTROL_REPOSITORY_PATH"].map {
            URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath, isDirectory: true)
        }
        let candidates = [
            configured,
            home.appendingPathComponent("Documents/Projects/mission-control", isDirectory: true),
            home.appendingPathComponent("Developer/mission-control", isDirectory: true),
            home.appendingPathComponent("Projects/mission-control", isDirectory: true),
            home.appendingPathComponent("mission-control", isDirectory: true)
        ].compactMap { $0 }

        if let existing = candidates.first(where: isMissionControlRepository) {
            return existing
        }

        let managed = home.appendingPathComponent(".mission-control/checkout", isDirectory: true)
        if isMissionControlRepository(managed) { return managed }

        guard let bundled = Bundle.main.resourceURL?
            .appendingPathComponent("MissionControlService", isDirectory: true),
              isMissionControlRepository(bundled) else {
            throw SetupError(message: "This build does not include the local service installer. Rebuild Mission Control and try again.")
        }
        try fileManager.createDirectory(at: managed.deletingLastPathComponent(), withIntermediateDirectories: true)
        if fileManager.fileExists(atPath: managed.path) {
            try fileManager.removeItem(at: managed)
        }
        try fileManager.copyItem(at: bundled, to: managed)
        guard isMissionControlRepository(managed) else {
            throw SetupError(message: "Mission Control could not prepare its managed local service files. Try setup again.")
        }
        return managed
    }

    private static func isMissionControlRepository(_ url: URL) -> Bool {
        let fileManager = FileManager.default
        return fileManager.isExecutableFile(atPath: url.appendingPathComponent("deploy/setup.sh").path) &&
            fileManager.fileExists(atPath: url.appendingPathComponent("server/package.json").path)
    }

    private static func runSetup(in repository: URL) throws {
        let command = """
        export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH
        export MISSION_CONTROL_SKIP_QR=1
        cd \(shellQuote(repository.path))
        ./deploy/setup.sh
        """
        try runShell(command)
    }

    private static func runShell(_ command: String) throws {
        let fileManager = FileManager.default
        guard let homePath = ProcessInfo.processInfo.environment["HOME"], !homePath.isEmpty else {
            throw SetupError(message: "Mission Control could not locate your home directory.")
        }
        let workingDirectory = URL(fileURLWithPath: homePath, isDirectory: true)
            .appendingPathComponent(".mission-control", isDirectory: true)
        try fileManager.createDirectory(at: workingDirectory, withIntermediateDirectories: true)
        let identifier = UUID().uuidString
        let script = workingDirectory.appendingPathComponent("setup-\(identifier).sh")
        let log = workingDirectory.appendingPathComponent("setup-\(identifier).log")
        let scriptContents = "#!/bin/zsh\nexec > \(shellQuote(log.path)) 2>&1\nset -euo pipefail\n" + command + "\n"
        try scriptContents.write(to: script, atomically: true, encoding: .utf8)
        chmod(script.path, S_IRUSR | S_IWUSR | S_IXUSR)
        defer { try? fileManager.removeItem(at: script) }

        var processID: pid_t = 0
        var arguments: [UnsafeMutablePointer<CChar>?] = [strdup("/bin/zsh"), strdup(script.path), nil]
        defer { arguments.compactMap { $0 }.forEach { free($0) } }
        let spawnStatus = arguments.withUnsafeMutableBufferPointer { buffer in
            posix_spawn(&processID, "/bin/zsh", nil, nil, buffer.baseAddress!, environ)
        }
        var processStatus: Int32 = 0
        if spawnStatus == 0 { waitpid(processID, &processStatus, 0) }
        let output = (try? String(contentsOf: log, encoding: .utf8)) ?? ""
        try? fileManager.removeItem(at: log)
        guard spawnStatus == 0, processStatus == 0 else {
            throw SetupError(message: safeFailureMessage(from: output))
        }
    }

    private static func pairingConfig() throws -> PairingConfig {
        guard let homePath = ProcessInfo.processInfo.environment["HOME"], !homePath.isEmpty else {
            throw SetupError(message: "Mission Control could not locate your home directory.")
        }
        let file = URL(fileURLWithPath: homePath, isDirectory: true)
            .appendingPathComponent(".mission-control/pairing.env")
        guard let contents = try? String(contentsOf: file, encoding: .utf8) else {
            throw SetupError(message: "The service installed, but Mission Control could not read its local pairing credentials. Try setup again.")
        }
        let values = Dictionary(uniqueKeysWithValues: contents.split(whereSeparator: \.isNewline).compactMap { line -> (String, String)? in
            let parts = line.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { return nil }
            return (parts[0], parts[1])
        })
        guard let url = values["APP_URL"], !url.isEmpty,
              let token = values["TOKEN"], !token.isEmpty else {
            throw SetupError(message: "The service installed, but its pairing credentials are incomplete. Try setup again.")
        }
        return PairingConfig(url: url, token: token)
    }

    private static func safeFailureMessage(from output: String) -> String {
        let safeLines = output
            .split(whereSeparator: \.isNewline)
            .map(String.init)
            .filter {
                let lower = $0.lowercased()
                return !lower.contains("token") && !lower.contains("missioncontrol://")
            }
            .suffix(6)
        if safeLines.isEmpty {
            return "Local setup did not finish. Make sure Node.js, npm, tmux, and Tailscale are installed, then try again."
        }
        return safeLines.joined(separator: "\n")
    }

    private static func shellQuote(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'"
    }
}

private struct FlightDeckArchivesView: View {
    let archives: [FlightDeckArchive]
    let selectedID: String?
    let onSelect: (FlightDeckArchive) -> Void
    let onChanged: () async -> Void

    @EnvironmentObject private var toasts: ToastCenter
    @State private var pendingDeletion: FlightDeckArchive?
    @State private var deleting = false

    private var selected: FlightDeckArchive? {
        archives.first { $0.id == selectedID } ?? archives.first
    }

    var body: some View {
        VStack(spacing: 0) {
            FlightDeckPageHeader(
                eyebrow: "ALL DEVICES / COLD STORAGE",
                title: "Archived chats",
                subtitle: "Completed conversations stay out of the live queue until you need them"
            ) { EmptyView() }
            HStack(spacing: 0) {
                archiveIndex.frame(width: FlightDeckLayout.indexWidth)
                if let selected {
                    transcript(selected).frame(minWidth: 500, maxWidth: .infinity)
                    archiveInspector(selected).frame(width: 300)
                } else {
                    FlightDeckEmptyState(
                        title: "No archived chats",
                        detail: "Archive a completed conversation from its session menu."
                    )
                }
            }
        }
        .background(FlightDeckPalette.background)
        .overlay {
            if let item = pendingDeletion {
                FlightDeckModalLayer(onDismiss: { pendingDeletion = nil }) {
                    FlightDeckDialogModal(
                        eyebrow: "ARCHIVE / PERMANENT DELETE",
                        title: "Delete archived chat?",
                        message: "The saved conversation for \(item.archive.session) cannot be recovered."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("CANCEL") { pendingDeletion = nil }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        Button("DELETE CHAT") {
                            pendingDeletion = nil
                            Task { await delete(item) }
                        }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                    }
                }
            }
        }
    }

    private var archiveIndex: some View {
        VStack(spacing: 0) {
            HStack {
                flightLabel("ARCHIVED / \(String(format: "%02d", archives.count))")
                Spacer()
                flightLabel("HIDDEN FROM LIVE")
            }
            .padding(.horizontal, 20)
            .frame(height: 54)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(archives) { item in
                        Button { onSelect(item) } label: {
                            VStack(alignment: .leading, spacing: 7) {
                                HStack {
                                    Text(item.archive.conversation.title ?? item.archive.session)
                                        .font(.flightSans(14, weight: .semibold))
                                        .lineLimit(1)
                                    Spacer(minLength: 8)
                                    Text(item.deviceCode)
                                        .font(.flightMono(7))
                                        .foregroundStyle(FlightDeckPalette.secondary)
                                }
                                Text("\(item.archive.agent.displayName.uppercased()) · \(item.archive.archivedDate.formatted(.relative(presentation: .named)))")
                                    .font(.flightMono(7))
                                    .foregroundStyle(FlightDeckPalette.muted)
                                Text(item.archive.cwd.map(abbreviateArchivePath) ?? "NO WORKING DIRECTORY")
                                    .font(.flightMono(8))
                                    .foregroundStyle(FlightDeckPalette.secondary)
                                    .lineLimit(1)
                            }
                            .foregroundStyle(item.id == selected?.id ? FlightDeckPalette.text : FlightDeckPalette.secondary)
                            .padding(.horizontal, 18)
                            .frame(height: 84)
                        }
                        .flightDeckIndexRow(selected: item.id == selected?.id)
                    }
                }
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .trailing) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private func transcript(_ item: FlightDeckArchive) -> some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    flightLabel("ARCHIVED TRANSCRIPT / READ ONLY")
                    Text(item.archive.conversation.title ?? item.archive.session)
                        .font(.flightSans(18, weight: .bold))
                }
                Spacer()
                Text(item.archive.agent.displayName.uppercased())
                    .font(.flightMono(8))
                    .foregroundStyle(FlightDeckPalette.amber)
            }
            .padding(.horizontal, 22)
            .frame(height: 72)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(item.archive.conversation.entries) { entry in
                        archiveEntry(entry)
                    }
                }
                .padding(22)
            }
        }
        .background(FlightDeckPalette.background)
    }

    @ViewBuilder
    private func archiveEntry(_ entry: ConversationEntry) -> some View {
        if entry.kind == "user" {
            HStack {
                Spacer(minLength: 52)
                Text(entry.text ?? "")
                    .font(.flightSans(12))
                    .padding(.horizontal, 13)
                    .padding(.vertical, 10)
                    .background(FlightDeckPalette.raised)
                    .overlay(Rectangle().stroke(FlightDeckPalette.border))
                    .textSelection(.enabled)
            }
        } else if entry.kind == "assistant" {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel("AGENT")
                MarkdownText(text: entry.text ?? "", color: FlightDeckPalette.text)
                    .font(.flightSans(12))
                    .textSelection(.enabled)
            }
        } else if entry.kind == "tool" {
            HStack(alignment: .top, spacing: 10) {
                Rectangle()
                    .fill(entry.status == "error" ? FlightDeckPalette.red : FlightDeckPalette.green)
                    .frame(width: 6, height: 6)
                    .padding(.top, 5)
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.verb ?? entry.tool ?? "Tool")
                        .font(.flightMono(8, weight: .bold))
                    if let arg = entry.arg, !arg.isEmpty {
                        Text(arg).font(.flightMono(8)).foregroundStyle(FlightDeckPalette.secondary)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FlightDeckPalette.surface)
            .overlay(Rectangle().stroke(FlightDeckPalette.border))
        }
    }

    private func archiveInspector(_ item: FlightDeckArchive) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel("ARCHIVE RECORD")
                Text("Conversation stored")
                    .font(.flightSans(20, weight: .bold))
                Text("REMOVED FROM LIVE OPERATIONS")
                    .font(.flightMono(8))
                    .foregroundStyle(FlightDeckPalette.green)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            VStack(spacing: 0) {
                archiveMetric("DEVICE", item.deviceCode)
                archiveMetric("AGENT", item.archive.agent.displayName.uppercased())
                archiveMetric("ARCHIVED", item.archive.archivedDate.formatted(date: .abbreviated, time: .shortened))
                archiveMetric("ENTRIES", String(format: "%03d", item.archive.conversation.entries.count))
                archiveMetric("MODEL", item.archive.conversation.model?.uppercased() ?? "UNKNOWN")
            }
            .padding(.horizontal, 20)

            if let cwd = item.archive.cwd {
                VStack(alignment: .leading, spacing: 8) {
                    flightLabel("WORKING DIRECTORY")
                    Text(cwd)
                        .font(.flightMono(8))
                        .foregroundStyle(FlightDeckPalette.secondary)
                        .textSelection(.enabled)
                }
                .padding(20)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
                .padding(20)
            }

            Spacer()
            Button(deleting ? "DELETING…" : "DELETE PERMANENTLY") { pendingDeletion = item }
                .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                .disabled(deleting)
                .padding(20)
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .leading) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private func archiveMetric(_ label: String, _ value: String) -> some View {
        HStack {
            flightLabel(label)
            Spacer()
            Text(value).font(.flightMono(8)).foregroundStyle(FlightDeckPalette.secondary).lineLimit(1)
        }
        .frame(height: 42)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private func delete(_ item: FlightDeckArchive) async {
        guard !deleting,
              let api = APIClient(urlString: item.server.url, token: item.server.token) else { return }
        deleting = true
        defer { deleting = false }
        do {
            try await api.deleteArchive(id: item.archive.id)
            await onChanged()
            toasts.show(.success, "Deleted archived chat")
        } catch {
            toasts.show(.error, "Couldn't delete archived chat")
        }
    }

    private var deletionPresented: Binding<Bool> {
        Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } })
    }

    private func abbreviateArchivePath(_ path: String) -> String {
        let components = path.split(separator: "/")
        guard components.count > 3 else { return path.uppercased() }
        return ("…/" + components.suffix(3).joined(separator: "/")).uppercased()
    }
}

private struct FlightDeckWorkspacesView: View {
    let workspaces: [FlightDeckWorkspace]
    let agents: [FlightDeckAgent]
    let selectedID: String?
    let onSelect: (FlightDeckWorkspace) -> Void
    let onAddFromShell: () -> Void
    let onOpenShell: (FlightDeckWorkspace, String?) -> Void
    let onChanged: () async -> Void

    @EnvironmentObject private var toasts: ToastCenter
    @State private var pendingClose: WorktreeCloseTarget?
    @State private var pendingWorkspaceRemoval: FlightDeckWorkspace?
    @State private var closing = false
    @State private var dirtyByPath: [String: Bool] = [:]

    private var selected: FlightDeckWorkspace? {
        workspaces.first { $0.id == selectedID } ?? workspaces.first
    }

    var body: some View {
        VStack(spacing: 0) {
            FlightDeckPageHeader(
                eyebrow: "ALL DEVICES / REPOSITORY MAP",
                title: "Workspaces",
                subtitle: "Inspect primary checkouts and safely manage every linked worktree"
            ) {
                Button("+ ADD FROM SHELL", action: onAddFromShell)
                    .buttonStyle(FlightDeckAccentButtonStyle())
            }
            HStack(spacing: 0) {
                workspaceIndex
                    .frame(width: FlightDeckLayout.indexWidth)
                if let selected {
                    workspaceDetail(selected)
                } else {
                    FlightDeckEmptyState(title: "No workspaces", detail: "Launch a shell, cd into a repository, and save it as a workspace.")
                }
            }
        }
        .background(FlightDeckPalette.background)
        .overlay {
            if let target = pendingClose {
                FlightDeckModalLayer(onDismiss: { pendingClose = nil }) {
                    FlightDeckDialogModal(
                        eyebrow: "WORKSPACES / WORKTREE CLEANUP",
                        title: "Remove worktree?",
                        message: target.worktree.dirty
                            ? "This worktree has uncommitted changes. Force clean discards them and keeps the branch."
                            : "Mission Control will stop sessions in this worktree, remove it, and keep the branch."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("CANCEL") { pendingClose = nil }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        if !target.worktree.dirty {
                            Button("REMOVE CLEANLY") {
                                pendingClose = nil
                                Task { await close(target, force: false) }
                            }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        }
                        Button("FORCE CLEAN") {
                            pendingClose = nil
                            Task { await close(target, force: true) }
                        }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                    }
                }
            } else if let workspace = pendingWorkspaceRemoval {
                FlightDeckModalLayer(onDismiss: { pendingWorkspaceRemoval = nil }) {
                    FlightDeckDialogModal(
                        eyebrow: "WORKSPACES / REMOVE INDEX",
                        title: "Remove workspace?",
                        message: "This removes the workspace from Mission Control. It does not delete the repository or worktrees."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("CANCEL") { pendingWorkspaceRemoval = nil }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        Button("REMOVE WORKSPACE") {
                            pendingWorkspaceRemoval = nil
                            Task { await remove(workspace) }
                        }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                    }
                }
            }
        }
        .task(id: selected?.id) { await loadDirtyState(for: selected) }
    }

    private var workspaceIndex: some View {
        VStack(spacing: 0) {
            HStack {
                flightLabel("WORKSPACES / \(String(format: "%02d", workspaces.count))")
                Spacer()
                flightLabel("ALL DEVICES")
            }
            .padding(.horizontal, 20)
            .frame(height: 54)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(workspaces) { workspace in
                        workspaceRow(workspace)
                    }
                }
            }
        }
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .trailing) { Rectangle().fill(FlightDeckPalette.border).frame(width: 1) }
    }

    private func workspaceRow(_ workspace: FlightDeckWorkspace) -> some View {
        let selected = workspace.id == self.selected?.id
        let active = agents.filter { $0.server.id == workspace.server.id && belongs($0, to: workspace) }.count
        return Button { onSelect(workspace) } label: {
            HStack(spacing: 12) {
                Rectangle().fill(FlightDeckPalette.green).frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 6) {
                    Text(workspace.workspace.name)
                        .font(.flightSans(15, weight: selected ? .bold : .semibold))
                    Text("\(workspace.deviceCode) · \(workspace.workspace.worktrees.count) CHECKOUT\(workspace.workspace.worktrees.count == 1 ? "" : "S") · \(active) AGENTS")
                        .font(.flightMono(7))
                        .foregroundStyle(FlightDeckPalette.muted)
                }
                Spacer(minLength: 0)
                Text("›").font(.flightMono(11)).foregroundStyle(selected ? FlightDeckPalette.amber : FlightDeckPalette.muted)
            }
            .foregroundStyle(selected ? FlightDeckPalette.text : FlightDeckPalette.secondary)
            .padding(.horizontal, 18)
            .frame(height: 72)
        }
        .flightDeckIndexRow(selected: selected)
    }

    private func workspaceDetail(_ selected: FlightDeckWorkspace) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    flightLabel("SELECTED WORKSPACE / \(selected.deviceCode)")
                    Text(selected.workspace.name).font(.flightSans(20, weight: .bold))
                }
                Spacer()
                Button("REMOVE WORKSPACE") { pendingWorkspaceRemoval = selected }
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
            }
            .frame(height: 64)
            .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }

            HStack(spacing: 0) {
                flightColumnLabel("CHECKOUT / BRANCH", width: 248)
                flightColumnLabel("PATH", width: 235)
                flightColumnLabel("STATE", width: 92)
                flightColumnLabel("ACTIONS", width: nil)
            }
            .padding(.horizontal, 16)
            .frame(height: 24)

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(selected.workspace.worktrees) { worktree in
                        worktreeRow(worktree, workspace: selected)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func worktreeRow(_ worktree: GitWorktree, workspace: FlightDeckWorkspace) -> some View {
        let active = agents.filter { $0.server.id == workspace.server.id && ($0.session.panePath == worktree.path || $0.session.panePath.hasPrefix(worktree.path + "/")) }.count
        let isDirty = dirtyByPath[worktree.path] ?? worktree.dirty
        let displayedWorktree = GitWorktree(
            path: worktree.path,
            branch: worktree.branch,
            isMain: worktree.isMain,
            dirty: isDirty
        )
        return HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(worktree.isMain ? "Primary checkout" : (worktree.branch ?? "Detached HEAD"))
                    .font(.flightSans(14, weight: worktree.isMain ? .bold : .semibold))
                    .lineLimit(1)
                Text("\(worktree.isMain ? "MAIN" : "LINKED WORKTREE") · \(active) ACTIVE AGENT\(active == 1 ? "" : "S")")
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.muted)
            }
            .frame(width: 248, alignment: .leading)
            Text(abbreviate(worktree.path))
                .font(.flightMono(9))
                .foregroundStyle(FlightDeckPalette.secondary)
                .lineLimit(1)
                .frame(width: 235, alignment: .leading)
            HStack(spacing: 6) {
                Rectangle().fill(isDirty ? FlightDeckPalette.red : FlightDeckPalette.green).frame(width: 7, height: 7)
                Text(isDirty ? "CHANGES" : "CLEAN")
                    .font(.flightMono(7))
                    .foregroundStyle(isDirty ? FlightDeckPalette.red : FlightDeckPalette.green)
            }
            .frame(width: 92, alignment: .leading)
            HStack(spacing: 8) {
                Button("SHELL HERE") { onOpenShell(workspace, worktree.path) }
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.amber))
                if !worktree.isMain {
                    Button("REMOVE") { pendingClose = WorktreeCloseTarget(workspace: workspace, worktree: displayedWorktree) }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: isDirty ? FlightDeckPalette.red : FlightDeckPalette.secondary))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 82)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(worktree.isMain ? FlightDeckPalette.raised : FlightDeckPalette.surface)
        .overlay(Rectangle().stroke(isDirty ? FlightDeckPalette.red : FlightDeckPalette.border))
    }

    private func loadDirtyState(for workspace: FlightDeckWorkspace?) async {
        guard let workspace,
              let api = APIClient(urlString: workspace.server.url, token: workspace.server.token) else {
            dirtyByPath = [:]
            return
        }
        dirtyByPath = (try? await api.worktreeDirty(workspaceID: workspace.workspace.id)) ?? [:]
    }

    private func close(_ target: WorktreeCloseTarget, force: Bool) async {
        guard !closing,
              let api = APIClient(urlString: target.workspace.server.url, token: target.workspace.server.token) else { return }
        closing = true
        defer { closing = false }
        do {
            let result = try await api.closeWorktree(
                workspaceID: target.workspace.workspace.id,
                path: target.worktree.path,
                force: force
            )
            await onChanged()
            toasts.show(.success, "Removed worktree and stopped \(result.killedSessions.count) session\(result.killedSessions.count == 1 ? "" : "s")")
        } catch {
            toasts.show(.error, "Couldn't remove worktree: \(error.localizedDescription)")
        }
    }

    private func remove(_ target: FlightDeckWorkspace) async {
        guard let api = APIClient(urlString: target.server.url, token: target.server.token) else { return }
        do {
            try await api.removeWorkspace(id: target.workspace.id)
            await onChanged()
            toasts.show(.success, "Removed \(target.workspace.name) from Mission Control")
        } catch {
            toasts.show(.error, "Couldn't remove workspace")
        }
    }

    private var closePresented: Binding<Bool> {
        Binding(get: { pendingClose != nil }, set: { if !$0 { pendingClose = nil } })
    }

    private var workspaceRemovalPresented: Binding<Bool> {
        Binding(get: { pendingWorkspaceRemoval != nil }, set: { if !$0 { pendingWorkspaceRemoval = nil } })
    }

    private func belongs(_ agent: FlightDeckAgent, to workspace: FlightDeckWorkspace) -> Bool {
        workspace.workspace.worktrees.contains { worktree in
            agent.session.panePath == worktree.path || agent.session.panePath.hasPrefix(worktree.path + "/")
        }
    }

    private func abbreviate(_ path: String) -> String {
        let components = path.split(separator: "/")
        guard components.count > 3 else { return path }
        return "…/" + components.suffix(3).joined(separator: "/")
    }
}

private struct WorktreeCloseTarget: Identifiable {
    let workspace: FlightDeckWorkspace
    let worktree: GitWorktree
    var id: String { workspace.id + "|" + worktree.path }
}

private struct FlightDeckPageHeader<Actions: View>: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 7) {
                flightLabel(eyebrow)
                Text(title)
                    .font(.flightSans(28, weight: .bold))
                    .tracking(-0.8)
                Text(subtitle)
                    .font(.flightSans(12))
                    .foregroundStyle(FlightDeckPalette.secondary)
            }
            Spacer()
            actions()
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 24)
        .frame(height: 132)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }
}

private struct FlightDeckEmptyState: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(spacing: 12) {
            Text("MC")
                .font(.flightMono(16, weight: .bold))
                .foregroundStyle(FlightDeckPalette.amber)
                .frame(width: 48, height: 48)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
            Text(title).font(.flightSans(20, weight: .bold))
            Text(detail)
                .font(.flightSans(12))
                .foregroundStyle(FlightDeckPalette.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(FlightDeckPalette.background)
    }
}

struct FlightDeckAccentButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.flightMono(9, weight: .bold))
            .foregroundStyle(FlightDeckPalette.onAccent)
            .padding(.horizontal, 14)
            .frame(height: 38)
            .background(FlightDeckPalette.amber.opacity(configuration.isPressed ? 0.72 : 1))
            .contentShape(Rectangle())
    }
}

struct FlightDeckSquareButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.flightMono(18))
            .foregroundStyle(FlightDeckPalette.amber)
            .frame(width: 38, height: 38)
            .overlay(Rectangle().stroke(FlightDeckPalette.amber))
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}

struct FlightDeckOutlineButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.flightMono(7, weight: .medium))
            .foregroundStyle(color)
            .padding(.horizontal, 14)
            .frame(height: 38)
            .overlay(Rectangle().stroke(color.opacity(0.75)))
            .opacity(configuration.isPressed ? 0.6 : 1)
            .contentShape(Rectangle())
    }
}

private struct FlightDeckIndexRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

private extension View {
    func flightDeckIndexRow(selected: Bool) -> some View {
        buttonStyle(FlightDeckIndexRowButtonStyle())
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? FlightDeckPalette.raised : FlightDeckPalette.surface)
            .overlay(alignment: .leading) {
                if selected {
                    Rectangle().fill(FlightDeckPalette.amber).frame(width: 3)
                }
            }
            .overlay(alignment: .bottom) {
                Rectangle().fill(FlightDeckPalette.border).frame(height: 1)
            }
            .contentShape(Rectangle())
    }
}

func flightLabel(_ text: String) -> some View {
    Text(text)
        .font(.flightMono(8))
        .tracking(0.8)
        .foregroundStyle(FlightDeckPalette.muted)
}

private func flightColumnLabel(_ text: String, width: CGFloat?) -> some View {
    flightLabel(text)
        .frame(width: width, alignment: .leading)
        .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
}

private func stateColor(_ state: SessionState) -> Color {
    switch state {
    case .needsInput: return FlightDeckPalette.amber
    case .working: return FlightDeckPalette.green
    case .idle: return FlightDeckPalette.secondary
    case .unknown: return FlightDeckPalette.muted
    }
}

private func stateLabel(_ state: SessionState) -> String {
    switch state {
    case .needsInput: return "INPUT"
    case .working: return "RUN"
    case .idle: return "IDLE"
    case .unknown: return "UNKNOWN"
    }
}
#endif
