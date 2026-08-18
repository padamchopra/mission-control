import Combine
import SwiftUI

/// Every decision waiting on you, across every paired server, in one queue.
///
/// The fleet list already floats needs-input sessions to the top, but acting on
/// them means opening each session, deciding, backing out, and repeating — and it
/// only ever shows the server you're currently looking at. This store keeps the
/// whole set in memory so the badge is honest and the queue opens already filled.
///
/// It's push-driven: a hook event that changes any session's state re-fetches the
/// affected servers. The slow poll behind it is only a safety net for pushes
/// missed while the app was suspended.
@MainActor
final class InboxStore: ObservableObject {
    static let shared = InboxStore()

    @Published private(set) var items: [InboxItem] = []
    @Published private(set) var loading = false

    private var subscriptions: Set<AnyCancellable> = []
    private var poller: Task<Void, Never>?
    private var pending: Task<Void, Never>?
    private var refreshing = false
    private var refreshAgain = false
    private var snoozedUntil: [String: TimeInterval]
    private let snoozeKey = "inboxSnoozedUntil"

    private init() {
        snoozedUntil = UserDefaults.standard.data(forKey: snoozeKey)
            .flatMap { try? JSONDecoder().decode([String: TimeInterval].self, from: $0) } ?? [:]
    }

    var count: Int { items.count }

    func activate() {
        guard poller == nil else { return }
        PushChannel.shared.sessionUpdates
            .sink { push in Task { @MainActor [weak self] in self?.consider(push) } }
            .store(in: &subscriptions)
        PushChannel.shared.sessionListChanges
            .sink { _ in Task { @MainActor [weak self] in self?.requestRefresh() } }
            .store(in: &subscriptions)
        ServerStore.shared.$servers
            .dropFirst()
            .sink { _ in Task { @MainActor [weak self] in self?.requestRefresh() } }
            .store(in: &subscriptions)
        poller = Task { await pollLoop() }
    }

    /// Drop an item we've just acted on. The server will confirm by pushing the
    /// session's new state, but the queue has to advance immediately — waiting
    /// for the round trip would leave a decision you've already made on screen.
    func drop(_ item: InboxItem) {
        items.removeAll { $0.id == item.id }
    }

    func snooze(serverID: String, session: String, until: Date) {
        let id = "\(serverID)|\(session)"
        snoozedUntil[id] = until.timeIntervalSince1970
        items.removeAll { $0.id == id }
        UserDefaults.standard.set(try? JSONEncoder().encode(snoozedUntil), forKey: snoozeKey)
    }

    /// Most pushes can't change the queue — a tool call starting says nothing
    /// about decisions, and refreshing on each one would put the fleet back on a
    /// hot poll. Only a session asking for input, or one already in the queue
    /// moving on (someone answered it in the terminal), needs a re-read.
    private func consider(_ push: SessionPush) {
        let queued = items.contains { $0.serverURL == push.serverURL && $0.session == push.session }
        guard push.state == .needsInput || queued else { return }
        requestRefresh()
    }

    func requestRefresh() {
        guard pending == nil else { return }
        pending = Task {
            try? await Task.sleep(for: .milliseconds(500))
            await refresh()
            pending = nil
        }
    }

    /// Coalesced rather than dropped: a request arriving mid-fetch re-runs once
    /// the current one lands, so a decision can't sit invisible until the poll.
    func refresh() async {
        if refreshing {
            refreshAgain = true
            return
        }
        refreshing = true
        defer { refreshing = false }
        repeat {
            refreshAgain = false
            await fetchAll()
        } while refreshAgain
    }

    private func fetchAll() async {
        let servers = ServerStore.shared.servers
        guard !servers.isEmpty else {
            items = []
            return
        }
        loading = items.isEmpty
        // One server being unreachable must not hide the others' decisions, and
        // its timeout must not delay them either.
        let fetches = servers.map { server in
            Task { await Self.fetch(from: server) }
        }
        var collected: [InboxItem] = []
        for fetch in fetches {
            collected += await fetch.value
        }
        let now = Date().timeIntervalSince1970
        snoozedUntil = snoozedUntil.filter { $0.value > now }
        UserDefaults.standard.set(try? JSONEncoder().encode(snoozedUntil), forKey: snoozeKey)
        items = collected
            .filter { snoozedUntil[$0.id] == nil }
            .sorted { $0.waitingSince < $1.waitingSince }
        loading = false
    }

    private static func fetch(from server: Server) async -> [InboxItem] {
        guard let api = APIClient(urlString: server.url, token: server.token) else { return [] }
        var fetched: [InboxItem]
        do {
            fetched = try await api.inbox()
        } catch APIError.badStatus(404) {
            // A server that predates the endpoint still knows which sessions
            // need input — it just can't attach the decision context.
            fetched = ((try? await api.sessions()) ?? [])
                .filter { $0.resolvedState == .needsInput }
                .map { InboxItem(fallbackFrom: $0) }
        } catch {
            return []
        }
        for index in fetched.indices {
            fetched[index].serverID = server.id
            fetched[index].serverName = server.name
            fetched[index].serverURL = server.url
            fetched[index].serverToken = server.token
        }
        return fetched
    }

    private func pollLoop() async {
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(for: .seconds(60))
        }
    }
}

/// The queue itself: read the ask, decide, move to the next one.
struct DecisionInboxView: View {
    @ObservedObject private var store = InboxStore.shared
    @ObservedObject private var servers = ServerStore.shared
    @Environment(\.dismiss) private var dismiss

    @State private var replyTarget: InboxItem?
    @State private var replyText = ""
    @State private var acting: Set<String> = []
    @State private var expanded: Set<String> = []
    // Shown in the list rather than as a toast: the toast overlay belongs to the
    // fleet view underneath, so a failure raised here would be hidden by the sheet.
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Decisions")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .task { await store.refresh() }
        .alert("Reply", isPresented: replyPresented, presenting: replyTarget) { item in
            TextField("Message", text: $replyText)
            Button("Send") { send(replyText, to: item) }
            Button("Cancel", role: .cancel) {}
        } message: { item in
            Text("Answer \(item.session) in its own words instead of accepting the default.")
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.items.isEmpty {
            if store.loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Nothing waiting", systemImage: "checkmark.circle")
                } description: {
                    Text("No session needs a decision right now. Anything that comes up lands here.")
                }
            }
        } else {
            List {
                if let errorText {
                    Section {
                        Label(errorText, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(MCColor.errorForeground)
                    }
                }
                ForEach(store.items) { item in
                    Section { card(item) }
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await store.refresh() }
        }
    }

    private func card(_ item: InboxItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            header(item)
            if let detail = item.detail, !detail.isEmpty {
                Text(detail)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(MCColor.warningForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let tool = item.pendingTool, tool.verb != nil || tool.arg != nil {
                pendingToolRow(tool)
            }
            if let question = item.question {
                questionBlock(question)
            }
            if let text = item.assistantText, !text.isEmpty {
                assistantBlock(item, text)
            }
            contextRow(item)
            actions(item)
        }
        .padding(.vertical, 4)
    }

    private func header(_ item: InboxItem) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(item.session)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.middle)
            if servers.servers.count > 1 {
                Text(item.serverName)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.18), in: Capsule())
                    .foregroundStyle(MCColor.mutedForeground)
            }
            Spacer(minLength: 4)
            Label(waitingLabel(item), systemImage: "hourglass")
                .font(.caption.weight(.semibold))
                .foregroundStyle(MCColor.warningForeground)
                .labelStyle(.titleAndIcon)
        }
    }

    private func pendingToolRow(_ tool: InboxItem.PendingTool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "hammer")
                .font(.caption2)
                .foregroundStyle(MCColor.mutedForeground)
            Text(tool.verb ?? tool.tool ?? "Tool")
                .font(.system(.caption, design: .monospaced).weight(.semibold))
            if let arg = tool.arg, !arg.isEmpty {
                Text(arg)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(MCColor.mutedForeground)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
    }

    private func questionBlock(_ question: ConversationQuestion) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(question.question)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                HStack(alignment: .top, spacing: 7) {
                    Text("\(index + 1).")
                        .font(.caption.monospaced())
                        .foregroundStyle(.tertiary)
                    Text(option.label)
                        .font(.caption)
                        .foregroundStyle(index == 0 ? .primary : .secondary)
                    Spacer(minLength: 0)
                }
            }
            if !question.options.isEmpty {
                Text("Open the session to choose and submit an answer.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func assistantBlock(_ item: InboxItem, _ text: String) -> some View {
        let isOpen = expanded.contains(item.id)
        return VStack(alignment: .leading, spacing: 4) {
            Text(text)
                .font(.caption)
                .foregroundStyle(MCColor.mutedForeground)
                .lineLimit(isOpen ? nil : 4)
                .fixedSize(horizontal: false, vertical: true)
            if text.count > 220 {
                Button(isOpen ? "Less" : "More") {
                    if isOpen { expanded.remove(item.id) } else { expanded.insert(item.id) }
                }
                .font(.caption2.weight(.semibold))
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
            }
        }
    }

    @ViewBuilder
    private func contextRow(_ item: InboxItem) -> some View {
        let path = item.cwd.map { $0.split(separator: "/").last.map(String.init) ?? $0 }
        if item.diffStat != nil || path != nil {
            HStack(spacing: 8) {
                if let diff = item.diffStat {
                    Text("+\(diff.adds)").foregroundStyle(MCColor.successForeground)
                    Text("−\(diff.dels)").foregroundStyle(MCColor.errorForeground)
                    Text("· \(diff.files) file\(diff.files == 1 ? "" : "s")").foregroundStyle(MCColor.mutedForeground)
                }
                if let path {
                    Text(path).foregroundStyle(MCColor.mutedForeground).lineLimit(1).truncationMode(.head)
                }
                Spacer(minLength: 0)
            }
            .font(.caption2.monospaced())
        }
    }

    private func actions(_ item: InboxItem) -> some View {
        HStack(spacing: 8) {
            if acting.contains(item.id) {
                ProgressView().controlSize(.small)
            } else if item.questionRequestId != nil {
                Button("Answer") { open(item) }
                    .tint(MCColor.warningForeground)
            } else {
                Button("Approve") { respond(item, keys: ["enter"], note: "Approved \(item.session)") }
                    .tint(MCColor.successForeground)
                Button("Deny") { respond(item, keys: ["escape"], note: "Sent Escape to \(item.session)") }
                    .tint(MCColor.errorForeground)
                Button("Reply…") {
                    replyText = ""
                    replyTarget = item
                }
                Button("Open") { open(item) }
            }
            Spacer(minLength: 0)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .font(.caption)
    }

    private var replyPresented: Binding<Bool> {
        Binding(get: { replyTarget != nil }, set: { if !$0 { replyTarget = nil } })
    }

    private func waitingLabel(_ item: InboxItem) -> String {
        let seconds = Int(Date().timeIntervalSince(item.waitingSinceDate))
        if seconds < 60 { return "just now" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        return "\(minutes / 60)h \(minutes % 60)m"
    }

    private func respond(_ item: InboxItem, keys: [String], note: String) {
        act(item) { api in try await api.sendKeys(item.session, keys: keys) } note: { note }
    }

    private func send(_ text: String, to item: InboxItem) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        act(item) { api in try await api.sendText(item.session, text: trimmed) } note: { "Replied to \(item.session)" }
    }

    private func act(
        _ item: InboxItem,
        _ body: @escaping (APIClient) async throws -> Void,
        note: @escaping () -> String
    ) {
        guard let api = APIClient(urlString: item.serverURL, token: item.serverToken) else { return }
        acting.insert(item.id)
        errorText = nil
        Task {
            do {
                try await body(api)
                ToastCenter.shared.show(.success, note())
                // Leaves the queue immediately: a decision you've already made
                // must not stay on screen waiting for the server to confirm.
                store.drop(item)
            } catch {
                errorText = "Couldn't reach \(item.session) — \(error.localizedDescription)"
            }
            acting.remove(item.id)
        }
    }

    // Opening a decision on another server has to switch to it first, or the
    // session route would resolve against the wrong fleet.
    private func open(_ item: InboxItem) {
        if servers.activeID != item.serverID, !item.serverID.isEmpty {
            servers.activeID = item.serverID
        }
        dismiss()
        AppRouter.shared.openSession = item.session
    }
}

private extension InboxItem {
    /// What a server too old for `/inbox` can still tell us: that this session
    /// is waiting, and what it said it was waiting for.
    init(fallbackFrom session: TmuxSession) {
        self.init(
            session: session.name,
            detail: session.detail,
            waitingSince: session.lastOutputAt * 1000,
            cwd: session.panePath,
            muted: session.notificationsMuted,
            questionRequestId: session.interactionRequestId,
            diffStat: session.diffStat
        )
    }
}
