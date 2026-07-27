import SwiftUI

// Whether the feed is scrolled to its end, measured against the viewport height
// below. Reported by the content container — not by a sentinel row, which the
// LazyVStack unmounts once it leaves the render window, reporting "at bottom"
// exactly when the user is furthest from it. Publishing the verdict rather than a
// raw offset also keeps scrolling off the state-write path: it changes on
// crossings, not on every frame.
private struct AtBottomKey: PreferenceKey {
    static var defaultValue = true
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = nextValue() }
}

private struct ViewportHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Three dots that pulse in sequence — a lightweight "thinking" animation that
/// reads as activity even before Claude produces any output.
private struct TypingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Color(red: 0.42, green: 0.71, blue: 1.0))
                    .frame(width: 6, height: 6)
                    .scaleEffect(animating ? 1.0 : 0.5)
                    .opacity(animating ? 1.0 : 0.35)
                    .animation(
                        .easeInOut(duration: 0.6).repeatForever().delay(Double(index) * 0.2),
                        value: animating
                    )
            }
        }
        .onAppear { animating = true }
    }
}

/// A native, phone-friendly rendering of a session's Claude Code transcript:
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

    private var api: APIClient? { APIClient(urlString: serverURL, token: token) }

    private static let accent = Color(red: 0.04, green: 0.52, blue: 1.0)
    private static let verbColor = Color(red: 0.42, green: 0.71, blue: 1.0)
    private static let scrollSpace = "convScroll"
    // How far off the end still counts as "at bottom": enough that the button
    // doesn't flash while the feed settles, small enough that one scrolled-off
    // message brings it back.
    private static let bottomSlack: CGFloat = 60

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
        .background(Color.black)
        .task { await pollLoop() }
        // Every hook event — a tool starting, a turn ending — means the
        // transcript grew, so the feed follows the agent live instead of
        // arriving up to a poll late.
        .onReceive(PushChannel.shared.sessionUpdates) { push in
            guard push.serverURL == serverURL, push.session == sessionName else { return }
            requestRefresh()
        }
        .confirmationDialog("Clear this conversation?", isPresented: $confirmClear) {
            Button("Clear \(sessionName)", role: .destructive) {
                send("/clear", note: "Cleared \(sessionName)")
            }
        } message: {
            Text("Sends /clear. Claude loses the conversation's context — the transcript stays on disk, but the session starts fresh.")
        }
    }

    private func feed(_ conversation: Conversation) -> some View {
        VStack(spacing: 0) {
            if !conversation.todos.isEmpty {
                planBar(conversation.todos)
            }
            if conversation.context != nil || conversation.info != nil {
                contextBar(conversation)
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(conversation.entries) { entry in
                            row(entry).id(entry.id)
                        }
                        if conversation.state == "working" {
                            workingRow(conversation.action).id("WORKING")
                        }
                        // Queued prompts sit after the live indicator because
                        // that's their real position: behind the running turn.
                        ForEach(conversation.pending ?? []) { message in
                            pendingRow(message.text).id("PENDING-\(message.id)")
                        }
                        Color.clear.frame(height: 1).id("BOTTOM")
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 14)
                    // The content's bottom edge sits below the viewport's while
                    // anything is scrolled off, so maxY past the viewport height
                    // means the user has scrolled up.
                    .background(GeometryReader { geo in
                        Color.clear.preference(
                            key: AtBottomKey.self,
                            value: viewportHeight <= 0
                                || geo.frame(in: .named(Self.scrollSpace)).maxY <= viewportHeight + Self.bottomSlack
                        )
                    })
                }
                .coordinateSpace(name: Self.scrollSpace)
                .scrollDismissesKeyboard(.interactively)
                .background(GeometryReader { geo in
                    Color.clear.preference(key: ViewportHeightKey.self, value: geo.size.height)
                })
                .onPreferenceChange(AtBottomKey.self) { isAtBottom = $0 }
                .onPreferenceChange(ViewportHeightKey.self) { viewportHeight = $0 }
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
            actionChips(conversation)
        }
    }

    // A row of one-tap actions so the common moves — interrupt, approve, compact
    // — don't require switching to the terminal to press a key. Everything here
    // is either a whitelisted key or a fixed slash command sent as text; there's
    // no path from a chip to an arbitrary command.
    private func actionChips(_ conversation: Conversation) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                stateChips(conversation.state)
                compactChip(conversation.context)
                moreChip
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
        }
        .background(Color(white: 0.05))
        .overlay(alignment: .top) {
            Rectangle().fill(Color(white: 0.16)).frame(height: 0.5)
        }
    }

    @ViewBuilder
    private func stateChips(_ state: String?) -> some View {
        switch state {
        case "working":
            // Escape is what you'd press in the terminal to interrupt a turn.
            chip("Stop", "stop.circle", tint: .red) {
                sendKeys(["escape"], note: "Interrupted \(sessionName)")
            }
        case "needs_input":
            chip("Approve", "checkmark.circle", tint: .green) {
                sendKeys(["enter"], note: "Approved \(sessionName)")
            }
            chip("Deny", "xmark.circle", tint: .red) {
                sendKeys(["escape"], note: "Sent Escape to \(sessionName)")
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

    // `/model` normally opens a picker, which would be blind navigation from a
    // phone — but it also takes the name directly, so each item here is one
    // deterministic command. Aliases rather than pinned ids, so this doesn't go
    // stale every time the lineup moves.
    private static let modelAliases = ["default", "opus", "sonnet", "haiku"]

    private var moreChip: some View {
        Menu {
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
            Divider()
            Button(role: .destructive) { confirmClear = true } label: {
                Label("Clear conversation  (/clear)", systemImage: "trash")
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

    private func chipLabel(_ title: String, _ symbol: String, tint: Color?) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 11, weight: .semibold))
            Text(title).font(.caption.weight(.semibold))
        }
        .foregroundStyle(tint ?? Color(white: 0.78))
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(Color(white: 0.13), in: Capsule())
        .overlay(Capsule().stroke((tint ?? Color(white: 0.3)).opacity(tint == nil ? 1 : 0.5)))
        .opacity(acting ? 0.5 : 1)
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

    @ViewBuilder
    private func row(_ entry: ConversationEntry) -> some View {
        switch entry.kind {
        case "user": userRow(entry.text ?? "")
        case "assistant": assistantRow(entry.text ?? "")
        case "thinking": thinkingRow(entry)
        case "tool":
            if let questions = entry.questions, !questions.isEmpty {
                questionRow(entry, questions)
            } else {
                toolRow(entry)
            }
        default: EmptyView()
        }
    }

    private func userRow(_ text: String) -> some View {
        HStack {
            Spacer(minLength: 44)
            Text(text)
                .font(.callout)
                .foregroundStyle(.white)
                .padding(.horizontal, 13)
                .padding(.vertical, 9)
                .background(Self.accent, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .textSelection(.enabled)
        }
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
                    .foregroundStyle(Color(white: 0.72))
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .fill(Self.accent.opacity(0.14))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .strokeBorder(Self.accent.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    )
                    .textSelection(.enabled)
                Label("queued", systemImage: "clock")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(white: 0.5))
            }
        }
    }

    private func assistantRow(_ text: String) -> some View {
        MarkdownText(text: text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
    }

    // Live "Claude is processing" indicator, shown at the tail of the feed while
    // the session's hook state is `working`. Mirrors the thinking/spinner line
    // the terminal shows so you know it's busy without switching to the terminal.
    private func workingRow(_ action: String?) -> some View {
        HStack(spacing: 10) {
            TypingIndicator()
            Text(action?.isEmpty == false ? action! : "Thinking…")
                .font(.callout)
                .foregroundStyle(Color(white: 0.6))
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
    }

    private func thinkingRow(_ entry: ConversationEntry) -> some View {
        let isOpen = expanded.contains(entry.id)
        return VStack(alignment: .leading, spacing: 5) {
            Button { toggle(entry.id) } label: {
                HStack(spacing: 6) {
                    Image(systemName: "brain")
                    Text("Reasoning")
                    Image(systemName: isOpen ? "chevron.down" : "chevron.right").font(.system(size: 9))
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color(white: 0.5))
            }
            .buttonStyle(.plain)
            Text(entry.text ?? "")
                .font(.caption)
                .foregroundStyle(Color(white: 0.55))
                .lineLimit(isOpen ? nil : 2)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func toolRow(_ entry: ConversationEntry) -> some View {
        let isOpen = expanded.contains(entry.id)
        let hasDetail = (entry.diff?.isEmpty == false) || (entry.output?.isEmpty == false)
        return VStack(alignment: .leading, spacing: 8) {
            Button { if hasDetail { toggle(entry.id) } } label: {
                HStack(spacing: 8) {
                    statusIcon(entry.status)
                    Text(entry.verb ?? entry.tool ?? "Tool")
                        .font(.system(.caption, design: .monospaced).weight(.semibold))
                        .foregroundStyle(Self.verbColor)
                    if let arg = entry.arg, !arg.isEmpty {
                        Text(arg)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(Color(white: 0.6))
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    Spacer(minLength: 4)
                    if hasDetail {
                        Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                            .font(.system(size: 10))
                            .foregroundStyle(Color(white: 0.45))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            }
            .buttonStyle(.plain)

            if isOpen {
                if let diff = entry.diff, !diff.isEmpty {
                    diffView(file: entry.file, diff: diff)
                }
                if let output = entry.output, !output.isEmpty {
                    Text(output)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(Color(white: 0.6))
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(white: 0.07), in: RoundedRectangle(cornerRadius: 9))
                        .textSelection(.enabled)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // AskUserQuestion: Claude asked the user something. Rendered as an always-open
    // card — the questions, their options, and which one the user picked (or the
    // free-text answer they typed instead).
    private func questionRow(_ entry: ConversationEntry, _ questions: [ConversationQuestion]) -> some View {
        let answered = entry.status == "ok"
        return VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 7) {
                Image(systemName: "questionmark.bubble.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Self.verbColor)
                Text("Asked you")
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(Self.verbColor)
                Spacer(minLength: 4)
                if answered {
                    Label("answered", systemImage: "checkmark")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.green)
                } else {
                    Label("waiting", systemImage: "clock")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }
            ForEach(Array(questions.enumerated()), id: \.offset) { _, question in
                questionBlock(question)
            }
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private func questionBlock(_ question: ConversationQuestion) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let header = question.header, !header.isEmpty {
                Text(header.uppercased())
                    .font(.caption2.weight(.bold))
                    .kerning(0.6)
                    .foregroundStyle(Color(white: 0.5))
            }
            Text(question.question)
                .font(.callout)
                .foregroundStyle(Color(white: 0.9))
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(question.options) { option in
                    optionRow(option)
                }
                if let answer = question.answer, !answer.isEmpty {
                    freeAnswerRow(answer)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func optionRow(_ option: ConversationQuestionOption) -> some View {
        let selected = option.selected == true
        return HStack(alignment: .top, spacing: 9) {
            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 14))
                .foregroundStyle(selected ? Self.accent : Color(white: 0.3))
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(option.label)
                    .font(.caption.weight(selected ? .semibold : .regular))
                    .foregroundStyle(selected ? .white : Color(white: 0.75))
                if let description = option.description, !description.isEmpty {
                    Text(description)
                        .font(.caption2)
                        .foregroundStyle(Color(white: 0.5))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? Self.accent.opacity(0.14) : Color(white: 0.07),
                    in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(selected ? Self.accent.opacity(0.55) : Color.clear, lineWidth: 1)
        )
    }

    private func freeAnswerRow(_ answer: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(Self.accent)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text("Your answer")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color(white: 0.5))
                Text(answer)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .textSelection(.enabled)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Self.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(Self.accent.opacity(0.55), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func statusIcon(_ status: String?) -> some View {
        switch status {
        case "ok":
            Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.green)
        case "error":
            Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.red)
        default:
            Image(systemName: "circle").font(.system(size: 7)).foregroundStyle(Color(white: 0.4))
        }
    }

    private func diffView(file: String?, diff: [ConversationDiffLine]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let file, !file.isEmpty {
                Text(basename(file))
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Color(white: 0.5))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(white: 0.12))
            }
            ForEach(Array(diff.enumerated()), id: \.offset) { _, line in
                Text(diffPrefix(line.kind) + line.text)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(diffColor(line.kind))
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 1)
                    .background(diffBackground(line.kind))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color(white: 0.18)))
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
                        .foregroundStyle(Color(white: 0.55))
                    Spacer(minLength: 8)
                    progressBar(done: done, total: todos.count, width: 72)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color(white: 0.5))
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
                                .foregroundStyle(todo.status == "completed" ? Color(white: 0.5) : Color(white: 0.9))
                                .strikethrough(todo.status == "completed", color: Color(white: 0.4))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Color(white: 0.09))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color(white: 0.18)).frame(height: 0.5)
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
                            .foregroundStyle(Color(white: 0.85))
                        Spacer(minLength: 0)
                    }
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Color(white: 0.5))
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
        .background(Color(white: 0.09))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color(white: 0.18)).frame(height: 0.5)
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
                    .foregroundStyle(.orange)
            }
            detailRow("Model", info?.shortModel)
            detailRow("Effort", info?.effort)
            detailRow("Branch", info?.gitBranch)
            if let usage {
                detailRow("Context", "\(usage.tokens.formatted()) of \(usage.limit.formatted()) tokens")
                if usage.limitEstimated == true {
                    Text("Window size assumed — set contextLimit in the server's config.json if this session runs a larger one.")
                        .font(.caption2)
                        .foregroundStyle(Color(white: 0.45))
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let compactions = usage.compactions, compactions > 0 {
                    detailRow("Compacted", "\(compactions)× · \((usage.droppedTokens ?? 0).formatted()) tokens dropped")
                }
            }
            detailRow("Claude Code", info?.version)
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
                    .foregroundStyle(Color(white: 0.45))
                    .frame(width: 82, alignment: .leading)
                Text(value)
                    .font(.caption2.monospaced())
                    .foregroundStyle(Color(white: 0.8))
                    .textSelection(.enabled)
                Spacer(minLength: 0)
            }
        }
    }

    private func progressBar(done: Int, total: Int, width: CGFloat) -> some View {
        let fraction = total > 0 ? CGFloat(done) / CGFloat(total) : 0
        return ZStack(alignment: .leading) {
            Capsule().fill(Color(white: 0.22)).frame(width: width, height: 4)
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
                .background(Color.green, in: RoundedRectangle(cornerRadius: 4))
        case "in_progress":
            RoundedRectangle(cornerRadius: 4)
                .stroke(Color.orange, lineWidth: 2)
                .frame(width: 15, height: 15)
                .overlay(RoundedRectangle(cornerRadius: 2).fill(Color.orange).frame(width: 7, height: 7))
        default:
            RoundedRectangle(cornerRadius: 4)
                .stroke(Color(white: 0.3), lineWidth: 1.5)
                .frame(width: 15, height: 15)
        }
    }

    private var unavailableState: some View {
        VStack(spacing: 14) {
            Image(systemName: "text.bubble").font(.system(size: 34)).foregroundStyle(Color(white: 0.4))
            Text("No conversation for this session")
                .font(.headline)
                .foregroundStyle(Color(white: 0.85))
            Text("This looks like a shell session, or Claude Code is running without the Mission Control hooks. The live terminal has everything.")
                .font(.callout)
                .foregroundStyle(Color(white: 0.5))
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
    }

    private var errorState: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 30)).foregroundStyle(.orange)
            Text("Couldn't load the conversation")
                .font(.headline)
                .foregroundStyle(Color(white: 0.85))
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

    private func basename(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    private func diffPrefix(_ kind: String) -> String {
        switch kind {
        case "add": return "+ "
        case "del": return "- "
        default: return "  "
        }
    }

    private func diffColor(_ kind: String) -> Color {
        switch kind {
        case "add": return Color(red: 0.6, green: 0.91, blue: 0.69)
        case "del": return Color(red: 1.0, green: 0.6, blue: 0.58)
        default: return Color(white: 0.45)
        }
    }

    private func diffBackground(_ kind: String) -> Color {
        switch kind {
        case "add": return Color.green.opacity(0.13)
        case "del": return Color.red.opacity(0.13)
        default: return Color.clear
        }
    }
}
