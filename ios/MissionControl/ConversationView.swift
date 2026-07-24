import SwiftUI

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

    private var api: APIClient? { APIClient(urlString: serverURL, token: token) }

    private static let accent = Color(red: 0.04, green: 0.52, blue: 1.0)
    private static let verbColor = Color(red: 0.42, green: 0.71, blue: 1.0)

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
    }

    private func feed(_ conversation: Conversation) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(conversation.entries) { entry in
                        row(entry).id(entry.id)
                    }
                    if !conversation.todos.isEmpty {
                        planCard(conversation.todos).id("PLAN")
                    }
                    Color.clear.frame(height: 1).id("BOTTOM")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: conversation.entries.count) { _, _ in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("BOTTOM", anchor: .bottom) }
            }
            .onAppear {
                DispatchQueue.main.async { proxy.scrollTo("BOTTOM", anchor: .bottom) }
            }
        }
    }

    @ViewBuilder
    private func row(_ entry: ConversationEntry) -> some View {
        switch entry.kind {
        case "user": userRow(entry.text ?? "")
        case "assistant": assistantRow(entry.text ?? "")
        case "thinking": thinkingRow(entry)
        case "tool": toolRow(entry)
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

    private func assistantRow(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(Color(white: 0.93))
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
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

    private func planCard(_ todos: [ConversationTodo]) -> some View {
        let done = todos.filter { $0.status == "completed" }.count
        return VStack(alignment: .leading, spacing: 9) {
            Text("PLAN · \(done) of \(todos.count)")
                .font(.caption2.weight(.bold))
                .kerning(0.6)
                .foregroundStyle(Color(white: 0.5))
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
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
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

    private func pollLoop() async {
        await loadOnce()
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(3))
            if Task.isCancelled { break }
            await loadOnce()
        }
    }

    private func loadOnce() async {
        guard let api else { failed = true; return }
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
