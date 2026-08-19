import SwiftUI

/// A native, phone-friendly rendering of an agent transcript:
/// user prompts, assistant text, collapsible reasoning, tool calls with inline
/// diffs/output, and the live plan. It polls the server the same way the
/// terminal reconnects — the transcript on the Mac stays the source of truth.
struct ConversationView: View {
    let sessionName: String
    let serverURL: String
    let token: String
    var onShowTerminal: () -> Void

    @State private var conversation: Conversation?
    @State private var failed = false
    @State private var expanded: Set<String> = []
    @State private var viewportHeight: CGFloat = 0
    @State private var isAtBottom = true
    @State private var planExpanded = false
    @State private var pendingRefresh: Task<Void, Never>?
    @State private var loading = false
    @State private var acting = false
    @State private var confirmClear = false
    @State private var infoExpanded = false
    @State private var questionSelections: [String: Set<String>] = [:]
    @State private var questionCustomAnswers: [String: String] = [:]

    private var api: APIClient? { APIClient(urlString: serverURL, token: token) }

    // Both of these were per-platform constants, and `verbColor` disagreed
    // across them — amber on Mac, green on iPhone. They now come from the same
    // place the shared feed rows do.
    private static let accent = ConversationStyle.accent
    private static let verbColor = ConversationStyle.verb
    private static let scrollSpace = "convScroll"
    private var agent: AgentKind { conversation?.agent ?? .claude }

    var body: some View {
        Group {
            if let conversation {
                if conversation.available {
                    feed(conversation)
                } else {
                    unavailableState
                }
            } else if failed {
                errorState
            } else {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(FlightDeckPalette.background)
        .task { await pollLoop() }
        // Every hook event — a tool starting, a turn ending — means the
        // transcript grew, so the feed follows the agent live instead of
        // arriving up to a poll late.
        .onReceive(PushChannel.shared.sessionUpdates) { push in
            guard push.serverURL == serverURL, push.session == sessionName else { return }
            requestRefresh()
        }
        .onChange(of: conversation?.activeQuestion?.requestId) { _, _ in
            questionSelections = [:]
            questionCustomAnswers = [:]
        }
        #if targetEnvironment(macCatalyst)
        .overlay {
            if confirmClear {
                FlightDeckModalLayer(onDismiss: { confirmClear = false }) {
                    FlightDeckDialogModal(
                        eyebrow: "CONVERSATION / RESET CONTEXT",
                        title: "Clear this conversation?",
                        message: "Sends /clear. \(agent.displayName) loses the conversation's context — the transcript stays on disk, but the session starts fresh."
                    ) {
                        EmptyView()
                    } actions: {
                        Button("Cancel") { confirmClear = false }
                            .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                        Button("CLEAR \(sessionName)") {
                            confirmClear = false
                            send("/clear", note: "Cleared \(sessionName)")
                        }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                    }
                }
            }
        }
        #else
        .confirmationDialog("Clear this conversation?", isPresented: $confirmClear) {
            Button("Clear \(sessionName)", role: .destructive) {
                send("/clear", note: "Cleared \(sessionName)")
            }
        } message: {
            Text("Sends /clear. \(agent.displayName) loses the conversation's context — the transcript stays on disk, but the session starts fresh.")
        }
        #endif
    }

    private func feed(_ conversation: Conversation) -> some View {
        VStack(spacing: 0) {
            #if targetEnvironment(macCatalyst)
            flightDeckStatusBar(conversation)
            #else
            if !conversation.todos.isEmpty {
                planBar(conversation.todos)
            }
            if conversation.context != nil || conversation.info != nil {
                contextBar(conversation)
            }
            #endif
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(conversation.entries) { entry in
                            row(entry).id(entry.id)
                        }
                        if conversation.state == "working" {
                            ConversationWorkingRow(action: conversation.action).id("WORKING")
                        }
                        if let activeQuestion = conversation.activeQuestion {
                            activeQuestionRow(activeQuestion).id("QUESTION-\(activeQuestion.requestId)")
                        } else if let question = conversation.promptQuestion {
                            livePromptRow(question, raw: conversation.prompt).id("PROMPT")
                        } else if let prompt = conversation.prompt, !prompt.isEmpty {
                            promptRow(prompt).id("PROMPT")
                        }
                        // Queued prompts sit after the live indicator because
                        // that's their real position: behind the running turn.
                        ForEach(conversation.pending ?? []) { message in
                            pendingRow(message.text).id("PENDING-\(message.id)")
                        }
                        Color.clear.frame(height: 1).id("BOTTOM")
                    }
                    #if targetEnvironment(macCatalyst)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 26)
                    #else
                    .padding(.horizontal, 14)
                    .padding(.vertical, 14)
                    #endif
                    // The content's bottom edge sits below the viewport's while
                    // anything is scrolled off, so maxY past the viewport height
                    // means the user has scrolled up.
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
                .onChange(of: conversation.entries.count) { _, _ in
                    // Don't yank the user down while they're reading history; the
                    // jump button is there for that. Only follow new content when
                    // they're already at the bottom.
                    guard isAtBottom else { return }
                    withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("BOTTOM", anchor: .bottom) }
                }
                .onChange(of: conversation.state) { _, _ in
                    // Keep the working indicator in view as it appears/disappears.
                    guard isAtBottom else { return }
                    withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("BOTTOM", anchor: .bottom) }
                }
                .onAppear {
                    DispatchQueue.main.async { proxy.scrollTo("BOTTOM", anchor: .bottom) }
                }
                .overlay(alignment: .bottomTrailing) { jumpButton(proxy) }
                .animation(.easeOut(duration: 0.2), value: isAtBottom)
            }
            #if !targetEnvironment(macCatalyst)
            actionChips(conversation)
            #endif
        }
    }

    #if targetEnvironment(macCatalyst)
    private func flightDeckStatusBar(_ conversation: Conversation) -> some View {
        let done = conversation.todos.filter { $0.status == "completed" }.count
        let current = conversation.todos.first { $0.status == "in_progress" }
            ?? conversation.todos.first { $0.status != "completed" }
        return HStack(spacing: 10) {
            Text(conversation.todos.isEmpty ? "Session" : "PLAN \(String(format: "%02d", done))/\(String(format: "%02d", conversation.todos.count))")
                .foregroundStyle(FlightDeckPalette.green)
            Text(current?.content ?? conversation.action ?? conversation.info?.gitBranch ?? "Live session ready")
                .foregroundStyle(FlightDeckPalette.secondary)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(conversation.context.map { "\($0.percent)% CONTEXT" } ?? "LIVE")
                .foregroundStyle(FlightDeckPalette.warm)
                .lineLimit(1)
        }
        .font(.flightMono(7))
        .padding(.horizontal, 24)
        .frame(height: 48)
        .background(FlightDeckPalette.raised.opacity(0.72))
        .overlay(alignment: .bottom) { Rectangle().fill(FlightDeckPalette.border).frame(height: 1) }
    }
    #endif

    // A row of one-tap actions so the common moves — interrupt, approve, compact
    // — don't require switching to the terminal to press a key. Everything here
    // is either a whitelisted key or a fixed slash command sent as text; there's
    // no path from a chip to an arbitrary command.
    private func actionChips(_ conversation: Conversation) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                stateChips(conversation.state, structuredQuestion: conversation.activeQuestion != nil)
                compactChip(conversation.context)
                moreChip
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
        }
        #if targetEnvironment(macCatalyst)
        .background(FlightDeckPalette.surface)
        #else
        .background(MobileFlightDeckPalette.surface)
        #endif
        .overlay(alignment: .top) {
            Rectangle().fill(FlightDeckPalette.border).frame(height: 1)
        }
    }

    @ViewBuilder
    private func stateChips(_ state: String?, structuredQuestion: Bool) -> some View {
        switch state {
        case "working":
            // Escape is what you'd press in the terminal to interrupt a turn.
            chip("Stop", "stop.circle", tint: .red) {
                sendKeys(["escape"], note: "Interrupted \(sessionName)")
            }
        case "needs_input":
            if structuredQuestion {
                chip("Answer above", "questionmark.bubble", tint: .orange) {}
                    .disabled(true)
            } else {
                chip("Approve", "checkmark.circle", tint: .green) {
                    sendKeys(["enter"], note: "Approved \(sessionName)")
                }
                chip("Deny", "xmark.circle", tint: .red) {
                    sendKeys(["escape"], note: "Sent Escape to \(sessionName)")
                }
            }
        default:
            chip("Continue", "arrow.right.circle") {
                send("Continue", note: "Sent to \(sessionName)")
            }
        }
    }

    // Compacting is the remedy for the meter above, so the chip carries the
    // reading: it goes amber with the percentage once the window is tight.
    private func compactChip(_ usage: ContextUsage?) -> some View {
        let tight = usage?.isTight == true
        let title = tight ? "Compact · \(usage?.percent ?? 0)%" : "Compact"
        return chip(title, "arrow.down.right.and.arrow.up.left", tint: tight ? .orange : nil) {
            send("/compact", note: "Compacting \(sessionName)")
        }
    }

    // Claude accepts model aliases directly. Codex's lineup is dynamic, so open
    // its own picker instead of baking model names into the app.
    private static let modelAliases = ["default", "opus", "sonnet", "haiku"]

    private var moreChip: some View {
        Menu {
            if agent == .claude {
                Menu {
                    ForEach(Self.modelAliases, id: \.self) { alias in
                        Button(alias.capitalized) {
                            send("/model \(alias)", note: "Switched \(sessionName) to \(alias)")
                        }
                    }
                } label: {
                    Label("Switch model  (/model)", systemImage: "cpu")
                }
                Button {
                    send("/init", note: "Asked \(sessionName) to write CLAUDE.md")
                } label: {
                    Label("Write CLAUDE.md  (/init)", systemImage: "doc.badge.plus")
                }
            } else if agent == .codex {
                Button {
                    send("/model", note: "Opened the model picker in \(sessionName)")
                } label: {
                    Label("Choose model  (/model)", systemImage: "cpu")
                }
                Button {
                    send("/init", note: "Asked \(sessionName) to write AGENTS.md")
                } label: {
                    Label("Write AGENTS.md  (/init)", systemImage: "doc.badge.plus")
                }
            }
            if agent != .shell {
                Divider()
                Button(role: .destructive) { confirmClear = true } label: {
                    Label("Clear conversation  (/clear)", systemImage: "trash")
                }
            }
        } label: {
            chipLabel("More", "ellipsis", tint: nil)
        }
        .disabled(acting)
    }

    private func chip(
        _ title: String,
        _ symbol: String,
        tint: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            chipLabel(title, symbol, tint: tint)
        }
        .buttonStyle(.plain)
        .disabled(acting)
    }

    @ViewBuilder
    private func chipLabel(_ title: String, _ symbol: String, tint: Color?) -> some View {
        #if targetEnvironment(macCatalyst)
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 12, weight: .semibold))
            Text(title).font(.flightSans(10, weight: .semibold))
        }
        .foregroundStyle(tint ?? FlightDeckPalette.secondary)
        .padding(.horizontal, 12)
        .frame(height: 32)
        .background(FlightDeckPalette.surface)
        .overlay(Rectangle().stroke((tint ?? FlightDeckPalette.border).opacity(tint == nil ? 1 : 0.7)))
        .opacity(acting ? 0.5 : 1)
        #else
        HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 11, weight: .semibold))
            Text(title).font(.caption.weight(.semibold))
        }
        .foregroundStyle(tint ?? MCColor.foreground.opacity(0.72))
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(MCColor.popover, in: Capsule())
        .overlay(Capsule().stroke((tint ?? MCColor.mutedForeground).opacity(tint == nil ? 1 : 0.5)))
        .opacity(acting ? 0.5 : 1)
        #endif
    }

    private func send(_ text: String, note: String) {
        act(note) { api in try await api.sendText(sessionName, text: text) }
    }

    private func sendKeys(_ keys: [String], note: String) {
        act(note) { api in try await api.sendKeys(sessionName, keys: keys) }
    }

    private func act(_ note: String, _ body: @escaping (APIClient) async throws -> Void) {
        guard let api, !acting else { return }
        acting = true
        Task {
            do {
                try await body(api)
                ToastCenter.shared.show(.success, note)
                // The effect lands in the transcript (or in the pending list), so
                // pull it rather than waiting for the safety-net poll.
                requestRefresh()
            } catch {
                ToastCenter.shared.show(.error, "Couldn't reach \(sessionName)")
            }
            acting = false
        }
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
            .help("Jump to latest")
        }
    }

    private func row(_ entry: ConversationEntry) -> some View {
        ConversationEntryRow(entry: entry, expanded: $expanded)
    }

    // The pane's question, parsed into the same card an answered one gets — and
    // tappable, because the pane marks which row the cursor is on, so the arrows
    // needed to reach any other row are computable. The raw pane stays one tap
    // away for when the parse loses something.
    private func livePromptRow(_ question: ConversationQuestion, raw: String?) -> some View {
        let rawOpen = expanded.contains("PROMPT-RAW")
        return VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 7) {
                Image(systemName: "questionmark.bubble.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(MCColor.warningForeground)
                Text("Waiting on you")
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(MCColor.warningForeground)
                Spacer(minLength: 4)
                if raw?.isEmpty == false {
                    Button { toggle("PROMPT-RAW") } label: {
                        Text(rawOpen ? "Hide terminal" : "Terminal")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Self.verbColor)
                    }
                    .buttonStyle(.plain)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                if let header = question.header, !header.isEmpty {
                    Text(header)
                        .font(.caption2.weight(.bold))
                        .kerning(0.6)
                        .foregroundStyle(MCColor.mutedForeground)
                }
                Text(question.question)
                    .font(.callout)
                    .foregroundStyle(MCColor.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                        ConversationOptionRow(
                            option: option,
                            number: index + 1,
                            id: "PROMPT-o\(index)",
                            expanded: $expanded,
                            live: true,
                            disabled: acting,
                            onChoose: { choose(index, label: option.label) }
                        )
                    }
                }
                Text("Tap an option to answer it. The chevron marks the one Enter would take.")
                    .font(.caption2)
                    .foregroundStyle(MCColor.mutedForeground)
            }
            if rawOpen, let raw {
                ScrollView(.horizontal, showsIndicators: false) {
                    Text(raw)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(MCColor.foreground.opacity(0.72))
                        .textSelection(.enabled)
                        .fixedSize(horizontal: true, vertical: true)
                }
                .padding(9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: MCRadius.sm, style: .continuous))
            }
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MCColor.popover, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                .stroke(Color.orange.opacity(0.4), lineWidth: 1)
        )
    }

    /// The exact AskUserQuestion payload supplied by Claude. This card answers
    /// the blocking hook by request id, so selections work even though no
    /// terminal dialog has been rendered yet.
    private func activeQuestionRow(_ request: ActiveQuestionRequest) -> some View {
        ConversationQuestionPrompt(
            questions: request.questions,
            selections: $questionSelections,
            customAnswers: $questionCustomAnswers,
            submitting: acting,
            onSubmit: { answers in submit(request, answers: answers) }
        )
    }

    private func submit(_ request: ActiveQuestionRequest, answers: [String: String]) {
        act("Answered \(sessionName)") { api in
            try await api.answerQuestion(sessionName, requestId: request.requestId, answers: answers)
        }
    }

    private func choose(_ index: Int, label: String) {
        act("Chose \(label)") { api in try await api.chooseOption(sessionName, index: index) }
    }

    // What the session is waiting on, taken straight from the pane. Claude Code's
    // question dialogs live in the TUI and their transcript record isn't written
    // until they're answered, so while one is open this is the only place the
    // question exists — shown verbatim rather than not at all.
    private func promptRow(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 7) {
                Image(systemName: "questionmark.bubble.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(MCColor.warningForeground)
                Text("Waiting on you")
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(MCColor.warningForeground)
                Spacer(minLength: 4)
                Button { onShowTerminal() } label: {
                    Text("Open terminal")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Self.verbColor)
                }
                .buttonStyle(.plain)
            }
            // The pane is laid out for a fixed width, so let it scroll sideways
            // rather than reflowing it into nonsense.
            ScrollView(.horizontal, showsIndicators: false) {
                Text(text)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(MCColor.foreground)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: true, vertical: true)
            }
            Text("Answer with the chips below, or open the terminal to choose a specific option.")
                .font(.caption2)
                .foregroundStyle(MCColor.mutedForeground)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MCColor.popover, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                .stroke(Color.orange.opacity(0.4), lineWidth: 1)
        )
    }

    // A prompt Claude has been handed but hasn't started: same bubble as a sent
    // message, drawn hollow so it reads as not-yet-happened rather than as
    // history. Whichever device queued it, every device shows it.
    private func pendingRow(_ text: String) -> some View {
        HStack {
            Spacer(minLength: 44)
            VStack(alignment: .trailing, spacing: 4) {
                Text(text)
                    .font(.callout)
                    .foregroundStyle(MCColor.foreground.opacity(0.72))
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(
                        RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                            .fill(Self.accent.opacity(0.14))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                            .strokeBorder(Self.accent.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    )
                    .textSelection(.enabled)
                Label("queued", systemImage: "clock")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(MCColor.mutedForeground)
            }
        }
    }

    // The plan, pinned above the scrolling feed so progress stays glanceable no
    // matter where you are in the history. Collapsed to a one-line progress
    // summary by default; tap to reveal the full checklist.
    private func planBar(_ todos: [ConversationTodo]) -> some View {
        let done = todos.filter { $0.status == "completed" }.count
        return VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.22)) { planExpanded.toggle() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "checklist")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Self.verbColor)
                    Text("Plan")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                    Text("\(done) of \(todos.count)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(MCColor.mutedForeground)
                    Spacer(minLength: 8)
                    progressBar(done: done, total: todos.count, width: 72)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(MCColor.mutedForeground)
                        .rotationEffect(.degrees(planExpanded ? 0 : -90))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 11)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if planExpanded {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(Array(todos.enumerated()), id: \.offset) { _, todo in
                        HStack(alignment: .top, spacing: 9) {
                            todoBox(todo.status).padding(.top, 1)
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
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(MCColor.popover)
        .overlay(alignment: .bottom) {
            Rectangle().fill(MCColor.border).frame(height: 0.5)
        }
    }

    // Pinned under the plan for the same reason: how close this session is to
    // compacting shouldn't depend on where you are in the feed. Tapping it opens
    // the rest of the session's configuration — model, effort, permission mode,
    // branch, build — all of which Claude Code records as it goes, so none of it
    // needs a slash command whose output would land in the terminal instead.
    private func contextBar(_ conversation: Conversation) -> some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.22)) { infoExpanded.toggle() }
            } label: {
                HStack(spacing: 10) {
                    if let usage = conversation.context {
                        ContextMeter(usage: usage)
                    } else {
                        Text("Session")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(MCColor.foreground)
                        Spacer(minLength: 0)
                    }
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(MCColor.mutedForeground)
                        .rotationEffect(.degrees(infoExpanded ? 0 : -90))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Session details")

            if infoExpanded {
                sessionDetails(conversation)
            }
        }
        .background(MCColor.popover)
        .overlay(alignment: .bottom) {
            Rectangle().fill(MCColor.border).frame(height: 0.5)
        }
    }

    private func sessionDetails(_ conversation: Conversation) -> some View {
        let info = conversation.info
        let usage = conversation.context
        return VStack(alignment: .leading, spacing: 7) {
            // The one line here that's a warning rather than a fact.
            if let mode = info?.notablePermissionMode {
                Label(mode, systemImage: "exclamationmark.shield")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(MCColor.warningForeground)
            }
            detailRow("Model", info?.shortModel)
            detailRow("Effort", info?.effort)
            detailRow("Branch", info?.gitBranch)
            if let usage {
                detailRow("Context", "\(usage.tokens.formatted()) of \(usage.limit.formatted()) tokens")
                if usage.limitEstimated == true {
                    Text("Window size assumed — set contextLimit in the server's config.json if this session runs a larger one.")
                        .font(.caption2)
                        .foregroundStyle(MCColor.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let compactions = usage.compactions, compactions > 0 {
                    detailRow("Compacted", "\(compactions)× · \((usage.droppedTokens ?? 0).formatted()) tokens dropped")
                }
            }
            detailRow(agent.displayName, info?.version)
            detailRow("Session", info?.slug)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func detailRow(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            HStack(alignment: .top, spacing: 8) {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(MCColor.mutedForeground)
                    .frame(width: 82, alignment: .leading)
                Text(value)
                    .font(.caption2.monospaced())
                    .foregroundStyle(MCColor.foreground)
                    .textSelection(.enabled)
                Spacer(minLength: 0)
            }
        }
    }

    private func progressBar(done: Int, total: Int, width: CGFloat) -> some View {
        let fraction = total > 0 ? CGFloat(done) / CGFloat(total) : 0
        return ZStack(alignment: .leading) {
            Capsule().fill(MCColor.input).frame(width: width, height: 4)
            Capsule().fill(Self.verbColor).frame(width: width * fraction, height: 4)
        }
    }

    @ViewBuilder
    private func todoBox(_ status: String) -> some View {
        switch status {
        case "completed":
            Image(systemName: "checkmark")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: 15, height: 15)
                .background(Color.green, in: RoundedRectangle(cornerRadius: MCRadius.xs, style: .continuous))
        case "in_progress":
            RoundedRectangle(cornerRadius: MCRadius.xs, style: .continuous)
                .stroke(Color.orange, lineWidth: 2)
                .frame(width: 15, height: 15)
                .overlay(RoundedRectangle(cornerRadius: MCRadius.xs, style: .continuous).fill(Color.orange).frame(width: 7, height: 7))
        default:
            RoundedRectangle(cornerRadius: MCRadius.xs, style: .continuous)
                .stroke(MCColor.mutedForeground, lineWidth: 1.5)
                .frame(width: 15, height: 15)
        }
    }

    private var unavailableState: some View {
        #if targetEnvironment(macCatalyst)
        VStack(alignment: .leading, spacing: 16) {
            Text("No structured transcript")
                .font(.flightMono(8, weight: .bold))
                .foregroundStyle(FlightDeckPalette.warm)
            Text("This is a shell session. Its live terminal is the source of truth.")
                .font(.flightSans(12))
                .foregroundStyle(FlightDeckPalette.secondary)
            Button { onShowTerminal() } label: {
                Text("Open terminal")
                    .font(.flightMono(8, weight: .bold))
                    .foregroundStyle(FlightDeckPalette.onAccent)
                    .padding(.horizontal, 14)
                    .frame(height: 36)
                    .background(FlightDeckPalette.amber)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 26)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        #else
        VStack(spacing: 14) {
            Image(systemName: "text.bubble").font(.system(size: 34)).foregroundStyle(MCColor.mutedForeground)
            Text("No conversation for this session")
                .font(.headline)
                .foregroundStyle(MCColor.foreground)
            Text("This looks like a shell session, or the agent is running without trusted Remy hooks. The live terminal has everything.")
                .font(.callout)
                .foregroundStyle(MCColor.mutedForeground)
                .multilineTextAlignment(.center)
            Button { onShowTerminal() } label: {
                Label("Open terminal", systemImage: "chevron.left.forwardslash.chevron.right")
                    .font(.callout.weight(.semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Self.accent, in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
        }
        .padding(30)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        #endif
    }

    private var errorState: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 30)).foregroundStyle(MCColor.warningForeground)
            Text("Couldn't load the conversation")
                .font(.headline)
                .foregroundStyle(MCColor.foreground)
            Button("Retry") {
                failed = false
                Task { await loadOnce() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(30)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // Pushes drive the feed when the server sends them; this drops to a safety
    // net that also covers what hooks don't report, like a transcript written
    // by a session whose hooks aren't installed.
    private func pollLoop() async {
        await loadOnce()
        while !Task.isCancelled {
            let live = PushChannel.shared.isLive(serverURL)
            try? await Task.sleep(for: .seconds(live ? 15 : 3))
            if Task.isCancelled { break }
            await loadOnce()
        }
    }

    // Tool calls arrive in bursts (a PreToolUse and PostToolUse for each), so
    // queue at most one refetch at a time rather than one per event.
    private func requestRefresh() {
        guard pendingRefresh == nil else { return }
        pendingRefresh = Task {
            try? await Task.sleep(for: .milliseconds(400))
            await loadOnce()
            pendingRefresh = nil
        }
    }

    private func loadOnce() async {
        guard let api else { failed = true; return }
        // A pushed refresh can land while the safety-net poll is still in
        // flight. Skipping the overlap stops an older response from overwriting
        // a newer one — which would drop the newest entry out of the feed and
        // put it back a moment later. The fetch already running is delivering
        // what the push announced anyway.
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            conversation = try await api.conversation(sessionName)
            failed = false
        } catch {
            if conversation == nil { failed = true }
        }
    }

    private func toggle(_ id: String) {
        if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
    }
}
