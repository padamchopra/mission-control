import SwiftUI

/// The Chat tab: every conversation this server is running, newest first.
///
/// These are not tmux sessions. The server holds the Claude process for each one
/// and streams the turn to whichever devices are looking, so a chat started on
/// the Mac carries on in your pocket with the same feed and the same pending
/// approvals.
struct ChatListView: View {
    /// When bound, the caller owns presentation — the Mac shows the list beside
    /// the chat. Unbound, the list presents the chat itself, which is what the
    /// phone's tab wants.
    var selection: Binding<String?>?

    @ObservedObject private var store = ChatStore.shared
    @ObservedObject private var servers = ServerStore.shared
    @EnvironmentObject private var router: AppRouter

    @State private var openChatID: String?
    @State private var showNewChat = false
    @State private var pendingDelete: ChatSummary?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                newChatButton

                if servers.active == nil {
                    notice("No connection", "Add a device before starting a chat.")
                } else if let error = store.loadError, store.chats.isEmpty {
                    notice("Couldn't load chats", error)
                } else if store.chats.isEmpty, store.hasLoaded {
                    notice(
                        "No chats yet",
                        "Start one against any repository on this Mac. Claude runs there, with your own settings, CLAUDE.md and skills."
                    )
                } else if !store.hasLoaded {
                    ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.vertical, 30)
                }

                if !waiting.isEmpty {
                    heading("Needs you")
                    card { ForEach(waiting) { row($0) } }
                }
                if !working.isEmpty {
                    heading("Working")
                    card { ForEach(working) { row($0) } }
                }
                if !resting.isEmpty {
                    heading(waiting.isEmpty && working.isEmpty ? "Chats" : "Quiet")
                    card { ForEach(resting) { row($0) } }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 30)
        }
        .background(ConversationStyle.background)
        .foregroundStyle(.white)
        .refreshable { await store.refresh() }
        .task { if !store.hasLoaded { await store.refresh() } }
        // A push tap or deep link names a chat; open it wherever the list is.
        .onChange(of: router.openChat) { _, id in
            guard let id else { return }
            open(id)
            router.openChat = nil
        }
        .onAppear {
            if let id = router.openChat {
                open(id)
                router.openChat = nil
            }
        }
        .sheet(isPresented: $showNewChat) {
            NewChatSheet { id in
                showNewChat = false
                open(id)
            }
        }
        .fullScreenCover(item: chatBinding) { chat in
            ChatView(chatID: chat.id, onClose: { openChatID = nil })
        }
        .confirmationDialog(
            "Delete this chat?",
            isPresented: .init(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let chat = pendingDelete {
                    Task { try? await store.delete(chat.id) }
                }
                pendingDelete = nil
            }
        } message: {
            Text("The conversation is discarded. Anything it changed on disk stays.")
        }
    }

    /// `fullScreenCover(item:)` wants an Identifiable; the store owns the chat, so
    /// this resolves the id every time rather than holding a stale copy.
    private var chatBinding: Binding<ChatReference?> {
        Binding(
            // Nil while the caller presents the chat, so the cover stays shut.
            get: { selection == nil ? openChatID.map(ChatReference.init(id:)) : nil },
            set: { openChatID = $0?.id }
        )
    }

    private func open(_ id: String) {
        if let selection {
            selection.wrappedValue = id
        } else {
            openChatID = id
        }
    }

    private var waiting: [ChatSummary] { store.chats.filter { $0.state == .needsInput } }
    private var working: [ChatSummary] { store.chats.filter { $0.state == .working } }
    private var resting: [ChatSummary] { store.chats.filter { $0.state == .idle || $0.state == .error } }

    private var newChatButton: some View {
        Button { showNewChat = true } label: {
            HStack(spacing: 10) {
                Image(systemName: "plus.bubble.fill")
                    .font(.system(size: 15, weight: .semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("New chat")
                        .font(.subheadline.weight(.semibold))
                    Text("Talk to Claude in any directory on this Mac")
                        .font(.caption2)
                        .foregroundStyle(ConversationStyle.accent.opacity(0.75))
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(ConversationStyle.accent)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ConversationStyle.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ConversationStyle.accent.opacity(0.4)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(servers.active == nil)
        .padding(.top, 4)
    }

    private func heading(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption2.monospaced().weight(.bold))
            .kerning(0.8)
            .foregroundStyle(Color(white: 0.45))
            .padding(.top, 4)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) { content() }
            .background(ConversationStyle.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(ConversationStyle.border))
    }

    private func row(_ chat: ChatSummary) -> some View {
        Button { open(chat.id) } label: {
            HStack(alignment: .top, spacing: 11) {
                Circle()
                    .fill(color(for: chat.state))
                    .frame(width: 7, height: 7)
                    .padding(.top, 6)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(chat.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(chat.updatedDate, style: .relative)
                            .font(.caption2)
                            .foregroundStyle(Color(white: 0.4))
                            .lineLimit(1)
                    }
                    HStack(spacing: 6) {
                        Label(chat.folder, systemImage: "folder")
                            .font(.caption2.monospaced())
                            .foregroundStyle(Color(white: 0.5))
                            .lineLimit(1)
                        if let model = chat.model {
                            tag(model)
                        }
                        if chat.permissionMode.isNotable {
                            tag(chat.permissionMode.title, tint: .orange)
                        }
                        if let usage = chat.context, usage.isTight {
                            tag("\(usage.percent)% ctx", tint: .orange)
                        }
                    }
                    if chat.state == .needsInput {
                        Label("waiting on you", systemImage: "hand.raised.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.orange)
                    } else if chat.state == .working {
                        Label(chat.action ?? "working", systemImage: "circle.dotted")
                            .font(.caption2)
                            .foregroundStyle(ConversationStyle.verb)
                            .lineLimit(1)
                    } else if let preview = chat.preview, !preview.isEmpty {
                        Text(preview)
                            .font(.caption)
                            .foregroundStyle(Color(white: 0.5))
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selection?.wrappedValue == chat.id ? ConversationStyle.accent.opacity(0.09) : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) { pendingDelete = chat } label: {
                Label("Delete chat", systemImage: "trash")
            }
        }
        .overlay(alignment: .bottom) {
            if chat.id != store.chats.last?.id {
                Rectangle().fill(ConversationStyle.border).frame(height: 0.5).padding(.leading, 13)
            }
        }
    }

    private func tag(_ text: String, tint: Color = Color(white: 0.5)) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12), in: Capsule())
    }

    private func color(for state: ChatState) -> Color {
        switch state {
        case .needsInput: return .orange
        case .working: return ConversationStyle.verb
        case .error: return .red
        case .idle: return Color(white: 0.35)
        }
    }

    private func notice(_ title: String, _ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text(message)
                .font(.caption)
                .foregroundStyle(Color(white: 0.55))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ConversationStyle.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(ConversationStyle.border))
    }
}

/// A chat id in Identifiable clothing, for `fullScreenCover(item:)`.
struct ChatReference: Identifiable, Equatable {
    let id: String
}

/// Starting a chat is choosing a directory — that's what Claude will read, edit,
/// and run commands in. Workspaces already know the repositories on this Mac, so
/// they're offered first and a path field stays for anything else.
struct NewChatSheet: View {
    let onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var store = ChatStore.shared

    @State private var workspaces: [Workspace] = []
    @State private var path = ""
    @State private var title = ""
    @State private var firstMessage = ""
    @State private var model: ChatModel = .default
    @State private var permissionMode: ChatPermissionMode = .default
    @State private var creating = false
    @State private var error: String?

    private var api: APIClient? {
        guard let server = ServerStore.shared.active else { return nil }
        return APIClient(urlString: server.url, token: server.token)
    }

    private var canCreate: Bool {
        !path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !creating
    }

    var body: some View {
        NavigationStack {
            Form {
                if !workspaces.isEmpty {
                    Section("Repository") {
                        ForEach(workspaces) { workspace in
                            Button { path = workspace.path } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(workspace.name)
                                        Text(workspace.path)
                                            .font(.caption2.monospaced())
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                            .truncationMode(.head)
                                    }
                                    Spacer()
                                    if path == workspace.path {
                                        Image(systemName: "checkmark").foregroundStyle(.orange)
                                    }
                                }
                            }
                            // A worktree is where the work for a branch actually
                            // happens, so offer those too rather than only the
                            // primary checkout.
                            ForEach(workspace.worktrees.filter { !$0.isMain }) { worktree in
                                Button { path = worktree.path } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Label(worktree.branch ?? conversationBasename(worktree.path), systemImage: "arrow.triangle.branch")
                                                .font(.subheadline)
                                            Text(worktree.path)
                                                .font(.caption2.monospaced())
                                                .foregroundStyle(.secondary)
                                                .lineLimit(1)
                                                .truncationMode(.head)
                                        }
                                        Spacer()
                                        if path == worktree.path {
                                            Image(systemName: "checkmark").foregroundStyle(.orange)
                                        }
                                    }
                                }
                                .padding(.leading, 12)
                            }
                        }
                    }
                }

                Section("Directory") {
                    TextField("/Users/you/project", text: $path)
                        .font(.callout.monospaced())
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }

                Section("Claude") {
                    Picker("Model", selection: $model) {
                        ForEach(ChatModel.allCases) { Text($0.title).tag($0) }
                    }
                    Picker("Permissions", selection: $permissionMode) {
                        ForEach(ChatPermissionMode.allCases) { Text($0.title).tag($0) }
                    }
                    Text(permissionMode.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Optional") {
                    TextField("Title", text: $title)
                    TextField("First message", text: $firstMessage, axis: .vertical)
                        .lineLimit(1...5)
                }

                if let error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .navigationTitle("New chat")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(creating ? "Starting…" : "Start") { create() }
                        .disabled(!canCreate)
                }
            }
            .task { await loadWorkspaces() }
        }
        .preferredColorScheme(.dark)
    }

    private func loadWorkspaces() async {
        guard let api, let fetched = try? await api.workspaces() else { return }
        workspaces = fetched
        if path.isEmpty { path = fetched.first?.path ?? "" }
    }

    private func create() {
        guard canCreate else { return }
        creating = true
        error = nil
        let prompt = firstMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                let chat = try await store.create(
                    cwd: path.trimmingCharacters(in: .whitespacesAndNewlines),
                    title: title.isEmpty ? nil : title,
                    model: model,
                    permissionMode: permissionMode
                )
                // Sending here means one step from "new chat" to a running turn,
                // the way starting a task from a workspace already works.
                if !prompt.isEmpty {
                    await store.loadDetail(chat.id)
                    try await store.send(chat.id, text: prompt)
                }
                creating = false
                onCreated(chat.id)
            } catch {
                creating = false
                self.error = error.localizedDescription
            }
        }
    }
}
