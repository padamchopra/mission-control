import SwiftUI

/// One chat: the feed, whatever Claude is blocked on, and the composer.
///
/// Unlike a session's conversation this is not a mirror of anything — the server
/// is running Claude on the Mac and streaming the turn here, and there is no
/// terminal to fall back to. So everything a turn can ask for has to be
/// answerable in this view: tool approvals, structured questions, and stopping.
struct ChatView: View {
    let chatID: String
    var onClose: (() -> Void)?

    @ObservedObject private var store = ChatStore.shared
    @State private var expanded: Set<String> = []
    @State private var questionSelections: [String: Set<String>] = [:]
    @State private var questionCustomAnswers: [String: String] = [:]
    @State private var viewportHeight: CGFloat = 0
    @State private var isAtBottom = true
    @State private var planExpanded = false
    @State private var acting = false
    @State private var renaming = false
    @State private var draftTitle = ""
    @State private var confirmDelete = false
    @State private var actionError: String?

    private static let scrollSpace = "chatScroll"

    private var chat: ChatDetail? { store.detail(chatID) }

    var body: some View {
        VStack(spacing: 0) {
            header
            if let chat {
                if !chat.todos.isEmpty { planBar(chat.todos) }
                feed(chat)
                MessageComposer(
                    target: .chat(chatID),
                    sessionState: chat.state == .working ? .working : .idle,
                    agent: .claude
                )
            } else {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(ConversationStyle.background.ignoresSafeArea())
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .task(id: chatID) { await pollLoop() }
        // A question's draft answers belong to the request that asked, so a new
        // one never inherits the last one's selections.
        .onChange(of: chat?.question?.requestId) { _, _ in
            questionSelections = [:]
            questionCustomAnswers = [:]
        }
        .alert("Rename chat", isPresented: $renaming) {
            TextField("Title", text: $draftTitle)
            Button("Cancel", role: .cancel) {}
            Button("Save") { rename() }
        }
        .confirmationDialog("Delete this chat?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { delete() }
        } message: {
            Text("The conversation and its Claude session are discarded. Anything it changed on disk stays.")
        }
        .alert(
            "Couldn't do that",
            isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })
        ) {
            Button("OK") { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                if let onClose {
                    Button(action: onClose) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(ConversationStyle.accent)
                            .frame(width: 34, height: 34)
                            .background(ConversationStyle.surface, in: Circle())
                            .overlay(Circle().stroke(ConversationStyle.border))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Back")
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(chat?.title ?? "Chat")
                        .font(.headline)
                        .lineLimit(1)
                    Text(chat.map { conversationBasename($0.cwd) } ?? "")
                        .font(.caption2.monospaced())
                        .foregroundStyle(MCColor.mutedForeground)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                stateBadge
                menu
            }
            HStack(spacing: 7) {
                modelChip
                permissionChip
                Spacer(minLength: 0)
                if let usage = chat?.context {
                    Text("\(usage.percent)%")
                        .font(.caption2.monospaced())
                        .foregroundStyle(usage.isTight ? .orange : MCColor.mutedForeground)
                        .help("Context used")
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(ConversationStyle.background)
        .overlay(alignment: .bottom) { Rectangle().fill(ConversationStyle.border).frame(height: 0.5) }
    }

    @ViewBuilder
    private var stateBadge: some View {
        if let chat {
            switch chat.state {
            case .working:
                // Stopping is the one action worth a dedicated control: it's what
                // Escape would be in a terminal, and there is no terminal here.
                Button { stop() } label: {
                    Label("Stop", systemImage: "stop.fill")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(MCColor.errorForeground)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.red.opacity(0.12), in: Capsule())
                        .overlay(Capsule().stroke(Color.red.opacity(0.4)))
                }
                .buttonStyle(.plain)
                .disabled(acting)
            case .needsInput:
                badge("Needs you", color: .orange)
            case .error:
                badge("Failed", color: .red)
            case .idle:
                badge(chat.live ? "Ready" : "Idle", color: MCColor.mutedForeground)
            }
        }
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text.uppercased())
            .font(.caption2.monospaced().weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(color.opacity(0.12), in: Capsule())
    }

    private var menu: some View {
        Menu {
            Button {
                draftTitle = chat?.title ?? ""
                renaming = true
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            if chat?.live == true {
                Button {
                    retire()
                } label: {
                    Label("End Claude process", systemImage: "moon.zzz")
                }
            }
            Divider()
            Button(role: .destructive) { confirmDelete = true } label: {
                Label("Delete chat", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(MCColor.mutedForeground)
                .frame(width: 34, height: 34)
                .background(ConversationStyle.surface, in: Circle())
                .overlay(Circle().stroke(ConversationStyle.border))
        }
        .disabled(acting)
    }

    /// Model and permission mode are start-up options for the Claude process, so
    /// changing either retires the running one; the next message resumes the same
    /// conversation with the new setting.
    private var modelChip: some View {
        Menu {
            ForEach(ChatModel.allCases) { model in
                Button {
                    apply(model: model)
                } label: {
                    if ChatModel(value: chat?.model ?? nil) == model {
                        Label(model.title, systemImage: "checkmark")
                    } else {
                        Text(model.title)
                    }
                }
            }
        } label: {
            chipLabel(ChatModel(value: chat?.model ?? nil).title, symbol: "cpu", tint: nil)
        }
        .disabled(acting)
    }

    private var permissionChip: some View {
        Menu {
            ForEach(ChatPermissionMode.allCases) { mode in
                Button {
                    apply(permissionMode: mode)
                } label: {
                    VStack(alignment: .leading) {
                        if chat?.permissionMode == mode {
                            Label(mode.title, systemImage: "checkmark")
                        } else {
                            Text(mode.title)
                        }
                        Text(mode.detail)
                    }
                }
            }
        } label: {
            let mode = chat?.permissionMode ?? .default
            chipLabel(mode.title, symbol: "shield.lefthalf.filled", tint: mode.isNotable ? .orange : nil)
        }
        .disabled(acting)
    }

    private func chipLabel(_ title: String, symbol: String, tint: Color?) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 10, weight: .semibold))
            Text(title).font(.caption2.weight(.semibold))
            Image(systemName: "chevron.down").font(.system(size: 7, weight: .bold))
        }
        .foregroundStyle(tint ?? MCColor.foreground.opacity(0.72))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(ConversationStyle.surface, in: Capsule())
        .overlay(Capsule().stroke((tint ?? ConversationStyle.border).opacity(tint == nil ? 1 : 0.5)))
    }

    // MARK: - Feed

    private func feed(_ chat: ChatDetail) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if chat.entries.isEmpty {
                        emptyState(chat)
                    }
                    ForEach(chat.entries) { entry in
                        ConversationEntryRow(entry: entry, expanded: $expanded).id(entry.id)
                    }
                    if let approval = chat.approval {
                        approvalCard(approval).id("APPROVAL-\(approval.requestId)")
                    }
                    if let question = chat.question {
                        ConversationQuestionPrompt(
                            questions: question.questions,
                            selections: $questionSelections,
                            customAnswers: $questionCustomAnswers,
                            submitting: acting,
                            onSubmit: { answers in answer(question.requestId, answers: answers) }
                        )
                        .id("QUESTION-\(question.requestId)")
                    }
                    if chat.state == .working {
                        ConversationWorkingRow(action: chat.action).id("WORKING")
                    }
                    Color.clear.frame(height: 1).id("BOTTOM")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .background(GeometryReader { geo in
                    Color.clear.preference(
                        key: ConversationAtBottomKey.self,
                        value: viewportHeight <= 0
                            || geo.frame(in: .named(Self.scrollSpace)).maxY <= viewportHeight + conversationBottomSlack
                    )
                })
            }
            .coordinateSpace(name: Self.scrollSpace)
            .scrollDismissesKeyboard(.interactively)
            .background(GeometryReader { geo in
                Color.clear.preference(key: ConversationViewportHeightKey.self, value: geo.size.height)
            })
            .onPreferenceChange(ConversationAtBottomKey.self) { isAtBottom = $0 }
            .onPreferenceChange(ConversationViewportHeightKey.self) { viewportHeight = $0 }
            // Follow the turn only while the user is already at the end — being
            // yanked down mid-read is worse than having to scroll.
            .onChange(of: chat.entries.count) { _, _ in scrollToEnd(proxy) }
            .onChange(of: chat.entries.last?.text) { _, _ in scrollToEnd(proxy) }
            .onChange(of: chat.state) { _, _ in scrollToEnd(proxy) }
            .onAppear { DispatchQueue.main.async { proxy.scrollTo("BOTTOM", anchor: .bottom) } }
            .overlay(alignment: .bottomTrailing) { jumpButton(proxy) }
            .animation(.easeOut(duration: 0.2), value: isAtBottom)
        }
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        guard isAtBottom else { return }
        withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("BOTTOM", anchor: .bottom) }
    }

    @ViewBuilder
    private func jumpButton(_ proxy: ScrollViewProxy) -> some View {
        if !isAtBottom {
            Button {
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("BOTTOM", anchor: .bottom) }
            } label: {
                Image(systemName: "arrow.down")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(11)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.15)))
            }
            .buttonStyle(.plain)
            .contentShape(Circle())
            .padding(.trailing, 14)
            .padding(.bottom, 14)
            .transition(.scale.combined(with: .opacity))
            .accessibilityLabel("Jump to latest")
        }
    }

    private func emptyState(_ chat: ChatDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Claude is waiting in \(conversationBasename(chat.cwd))")
                .font(.headline)
                .foregroundStyle(MCColor.foreground)
            Text(chat.cwd)
                .font(.caption2.monospaced())
                .foregroundStyle(MCColor.mutedForeground)
            Text("It reads your Claude Code settings, CLAUDE.md, and skills from this directory — the same setup your terminal sessions run with.")
                .font(.callout)
                .foregroundStyle(MCColor.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Approvals

    /// A parked tool call. Claude is holding the turn open until this is
    /// answered, so the card carries everything needed to decide — the CLI's own
    /// prompt sentence when it supplied one, the proposed plan for a plan-mode
    /// hand-off, and the diff for an edit.
    private func approvalCard(_ approval: ChatApproval) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(MCColor.warningForeground)
                Text("Waiting on you")
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(MCColor.warningForeground)
                Spacer(minLength: 4)
                Text(approval.tool)
                    .font(.caption2.monospaced().weight(.semibold))
                    .foregroundStyle(MCColor.mutedForeground)
            }

            Text(approval.title ?? "\(approval.verb) \(approval.arg)")
                .font(.callout)
                .foregroundStyle(MCColor.foreground)
                .fixedSize(horizontal: false, vertical: true)

            if approval.title != nil, !approval.arg.isEmpty {
                Text("\(approval.verb) \(approval.arg)")
                    .font(.caption.monospaced())
                    .foregroundStyle(MCColor.mutedForeground)
                    .lineLimit(3)
            }
            if let reason = approval.reason, !reason.isEmpty {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(MCColor.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let plan = approval.plan, !plan.isEmpty {
                ScrollView {
                    MarkdownText(text: plan)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 260)
                .padding(10)
                .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
            }
            if let diff = approval.diff, !diff.isEmpty {
                ConversationDiffView(file: approval.file, diff: diff)
            }

            HStack(spacing: 8) {
                Button { respond(approval, decision: "allow") } label: {
                    actionLabel("Allow", symbol: "checkmark", tint: .green, filled: true)
                }
                .buttonStyle(.plain)
                if approval.allowAlways {
                    Button { respond(approval, decision: "allowAlways") } label: {
                        actionLabel("Always", symbol: "checkmark.shield", tint: .green, filled: false)
                    }
                    .buttonStyle(.plain)
                    .help("Allow this tool for the rest of the chat")
                }
                Button { respond(approval, decision: "deny") } label: {
                    actionLabel("Deny", symbol: "xmark", tint: .red, filled: false)
                }
                .buttonStyle(.plain)
            }
            .disabled(acting)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MCColor.popover, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                .stroke(Color.orange.opacity(0.4), lineWidth: 1)
        )
    }

    private func actionLabel(_ title: String, symbol: String, tint: Color, filled: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 11, weight: .bold))
            Text(title).font(.caption.weight(.semibold))
        }
        .foregroundStyle(filled ? .black : tint)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(filled ? tint : tint.opacity(0.12), in: Capsule())
        .overlay(Capsule().stroke(tint.opacity(filled ? 0 : 0.45)))
        .opacity(acting ? 0.5 : 1)
    }

    // MARK: - Plan

    private func planBar(_ todos: [ConversationTodo]) -> some View {
        let done = todos.filter { $0.status == "completed" }.count
        return VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.22)) { planExpanded.toggle() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "checklist")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(ConversationStyle.verb)
                    Text("Plan")
                        .font(.subheadline.weight(.semibold))
                    Text("\(done) of \(todos.count)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(MCColor.mutedForeground)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(MCColor.mutedForeground)
                        .rotationEffect(.degrees(planExpanded ? 0 : -90))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if planExpanded {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(Array(todos.enumerated()), id: \.offset) { _, todo in
                        HStack(alignment: .top, spacing: 9) {
                            Image(systemName: todo.status == "completed"
                                  ? "checkmark.circle.fill"
                                  : todo.status == "in_progress" ? "circle.lefthalf.filled" : "circle")
                                .font(.system(size: 13))
                                .foregroundStyle(todo.status == "completed" ? .green : MCColor.mutedForeground)
                            Text(todo.content)
                                .font(.caption)
                                .foregroundStyle(todo.status == "completed" ? MCColor.mutedForeground : MCColor.foreground)
                                .strikethrough(todo.status == "completed", color: MCColor.mutedForeground)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }
        }
        .background(MCColor.popover)
        .overlay(alignment: .bottom) { Rectangle().fill(MCColor.border).frame(height: 0.5) }
    }

    // MARK: - Actions

    private func respond(_ approval: ChatApproval, decision: String) {
        act { try await store.respond(chatID, requestId: approval.requestId, decision: decision) }
    }

    private func answer(_ requestId: String, answers: [String: String]) {
        act { try await store.answer(chatID, requestId: requestId, answers: answers) }
    }

    private func stop() {
        act { try await store.interrupt(chatID) }
    }

    private func retire() {
        act {
            guard let server = ServerStore.shared.active,
                  let api = APIClient(urlString: server.url, token: server.token) else { return }
            try await api.stopChat(chatID)
        }
    }

    private func rename() {
        let title = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        act { try await store.update(chatID, title: title) }
    }

    private func apply(model: ChatModel) {
        act { try await store.update(chatID, model: model) }
    }

    private func apply(permissionMode: ChatPermissionMode) {
        act { try await store.update(chatID, permissionMode: permissionMode) }
    }

    private func delete() {
        act {
            try await store.delete(chatID)
            await MainActor.run { onClose?() }
        }
    }

    /// Pushes drive the feed; this is the safety net for a dropped socket or a
    /// window where the app was suspended. A chat can't fall back to a terminal,
    /// so it polls rather than risking a feed that has quietly stopped moving.
    private func pollLoop() async {
        await store.loadDetail(chatID)
        while !Task.isCancelled {
            let live = ServerStore.shared.active.map { PushChannel.shared.isLive($0.url) } ?? false
            try? await Task.sleep(for: .seconds(live ? 20 : 3))
            if Task.isCancelled { break }
            await store.loadDetail(chatID)
        }
    }

    private func act(_ body: @escaping () async throws -> Void) {
        guard !acting else { return }
        acting = true
        Task {
            do {
                try await body()
            } catch {
                actionError = error.localizedDescription
            }
            acting = false
        }
    }
}
