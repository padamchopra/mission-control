import SwiftUI

/// The shared vocabulary of an agent feed: prompt bubbles, assistant prose,
/// collapsible reasoning, tool chips with diffs and output, and question cards.
///
/// Two surfaces render these — the mirror of a tmux session's transcript
/// (`ConversationView`) and a chat Remy runs itself (`ChatView`).
/// They differ in where the entries come from and what you can do about them,
/// never in how a turn reads, so the rows live here rather than in either one.

/// Whether a feed is scrolled to its end, measured against the viewport height
/// below. Reported by the content container — not by a sentinel row, which a
/// LazyVStack unmounts once it leaves the render window, reporting "at bottom"
/// exactly when the user is furthest from it. Publishing the verdict rather than
/// a raw offset also keeps scrolling off the state-write path: it changes on
/// crossings, not on every frame.
struct ConversationAtBottomKey: PreferenceKey {
    static var defaultValue = true
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = nextValue() }
}

struct ConversationViewportHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// How far off the end still counts as "at bottom": enough that the jump button
/// doesn't flash while a feed settles, small enough that one scrolled-off
/// message brings it back.
let conversationBottomSlack: CGFloat = 60

/// The feed's own slice of the token set.
///
/// Every one of these used to be a `#if targetEnvironment(macCatalyst)` picking
/// between two palettes that held the same literals — and two of them had
/// drifted apart in the process, so the identical feed rendered differently on
/// Mac and iPhone. One token each now, shared by both.
enum ConversationStyle {
    static var accent: Color { MCColor.primary }

    /// Tool verbs and other "the agent did something" labels.
    ///
    /// Mac drew these in amber and iPhone in green. Resolved to the accent:
    /// whether the tool succeeded is already carried by the row's status icon,
    /// so the verb does not need to encode it in colour too.
    static var verb: Color { MCColor.primary }

    static var background: Color { MCColor.background }
    static var surface: Color { MCColor.card }
    static var border: Color { MCColor.border }
}

/// Three dots that pulse in sequence — a lightweight "thinking" animation that
/// reads as activity even before the agent produces any output.
struct ConversationTypingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    // Was green on Mac and a hardcoded blue on iPhone.
                    .fill(MCColor.primary)
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

/// The live "agent is processing" line, shown at the tail of a feed while a turn
/// is running. `action` is the current step, e.g. "Reading Foo.swift".
struct ConversationWorkingRow: View {
    let action: String?

    var body: some View {
        HStack(spacing: 10) {
            ConversationTypingIndicator()
            Text(action?.isEmpty == false ? action! : "Thinking…")
                .font(MCFont.body)
                .foregroundStyle(MCColor.mutedForeground)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
    }
}

/// One feed entry, rendered by kind. `expanded` is owned by the feed so a tool's
/// open/closed state survives the entry being re-decoded on every refresh.
struct ConversationEntryRow: View {
    let entry: ConversationEntry
    @Binding var expanded: Set<String>

    var body: some View {
        switch entry.kind {
        case "user":
            ConversationUserBubble(text: entry.text ?? "")
        case "assistant":
            ConversationAssistantText(text: entry.text ?? "")
        case "thinking":
            ConversationThinkingRow(entry: entry, expanded: $expanded)
        case "tool":
            if let questions = entry.questions, !questions.isEmpty {
                ConversationQuestionCard(entry: entry, questions: questions, expanded: $expanded)
            } else {
                ConversationToolRow(entry: entry, expanded: $expanded)
            }
        default:
            EmptyView()
        }
    }
}

struct ConversationUserBubble: View {
    let text: String

    var body: some View {
        HStack {
            // Indents the prompt so it reads as the person's turn without
            // needing a second colour.
            Spacer(minLength: 48)
            Text(text)
                .font(MCFont.body)
                .foregroundStyle(MCColor.primaryForeground)
                .padding(.horizontal, MCSpace.lg)
                .padding(.vertical, MCSpace.md)
                .background(
                    ConversationStyle.accent,
                    in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                )
                .textSelection(.enabled)
        }
    }
}

struct ConversationAssistantText: View {
    let text: String

    var body: some View {
        MarkdownText(text: text, color: MCColor.foreground)
            .font(MCFont.body)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
    }
}

struct ConversationThinkingRow: View {
    let entry: ConversationEntry
    @Binding var expanded: Set<String>

    private var isOpen: Bool { expanded.contains(entry.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Button { toggle(entry.id, in: $expanded) } label: {
                HStack(spacing: 6) {
                    Image(systemName: "brain")
                    Text("Reasoning")
                    Image(systemName: isOpen ? "chevron.down" : "chevron.right").font(.system(size: 9))
                }
                .font(MCFont.captionStrong)
                .foregroundStyle(MCColor.mutedForeground)
            }
            .buttonStyle(.plain)
            Text(entry.text ?? "")
                .font(MCFont.caption)
                .foregroundStyle(MCColor.mutedForeground)
                .lineLimit(isOpen ? nil : 2)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ConversationToolRow: View {
    let entry: ConversationEntry
    @Binding var expanded: Set<String>

    private var isOpen: Bool { expanded.contains(entry.id) }
    private var hasDetail: Bool { (entry.diff?.isEmpty == false) || (entry.output?.isEmpty == false) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { if hasDetail { toggle(entry.id, in: $expanded) } } label: {
                HStack(spacing: 8) {
                    ConversationStatusIcon(status: entry.status)
                    Text(entry.verb ?? entry.tool ?? "Tool")
                        .font(.system(.caption, design: .monospaced).weight(.semibold))
                        .foregroundStyle(ConversationStyle.verb)
                    if let arg = entry.arg, !arg.isEmpty {
                        Text(arg)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(MCColor.mutedForeground)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    Spacer(minLength: 4)
                    if hasDetail {
                        Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                            .font(.system(size: 10))
                            .foregroundStyle(MCColor.mutedForeground)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(MCColor.popover, in: RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous))
            }
            .buttonStyle(.plain)

            if isOpen {
                if let diff = entry.diff, !diff.isEmpty {
                    ConversationDiffView(file: entry.file, diff: diff)
                }
                if let output = entry.output, !output.isEmpty {
                    Text(output)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(MCColor.mutedForeground)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(MCColor.card, in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
                        .textSelection(.enabled)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// AskUserQuestion, after the fact: the questions, their options, and which one
/// the user picked (or the free text they typed instead). Always open — a
/// decision is the part of a turn you most often come back to read.
struct ConversationQuestionCard: View {
    let entry: ConversationEntry
    let questions: [ConversationQuestion]
    @Binding var expanded: Set<String>

    var body: some View {
        let answered = entry.status == "ok"
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 7) {
                Image(systemName: "questionmark.bubble.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(ConversationStyle.verb)
                Text("Asked you")
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(ConversationStyle.verb)
                Spacer(minLength: 4)
                if answered {
                    Label("answered", systemImage: "checkmark")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(MCColor.successForeground)
                } else {
                    Label("waiting", systemImage: "clock")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(MCColor.warningForeground)
                }
            }
            ForEach(Array(questions.enumerated()), id: \.offset) { index, question in
                ConversationQuestionBlock(
                    question: question,
                    id: "\(entry.id)-q\(index)",
                    expanded: $expanded
                )
            }
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MCColor.popover, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
    }
}

struct ConversationQuestionBlock: View {
    let question: ConversationQuestion
    let id: String
    @Binding var expanded: Set<String>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if let header = question.header, !header.isEmpty {
                    Text(header)
                        .font(.caption2.weight(.bold))
                        .kerning(0.6)
                        .foregroundStyle(MCColor.mutedForeground)
                }
                if question.multiSelect == true {
                    Text("pick any")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(MCColor.mutedForeground)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(MCColor.border, in: Capsule())
                }
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
                        id: "\(id)-o\(index)",
                        expanded: $expanded
                    )
                }
                if let answer = question.answer, !answer.isEmpty {
                    ConversationFreeAnswerRow(answer: answer)
                }
                if let notes = question.notes, !notes.isEmpty {
                    ConversationFreeAnswerRow(answer: notes, title: "Your notes")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ConversationOptionRow: View {
    let option: ConversationQuestionOption
    let number: Int
    let id: String
    @Binding var expanded: Set<String>
    /// A live prompt marks the row the cursor is on rather than a pick, so the
    /// same highlight gets a different glyph.
    var live = false
    var disabled = false
    var onChoose: (() -> Void)?

    private var selected: Bool { option.selected == true }
    private var hasPreview: Bool { option.preview?.isEmpty == false }
    private var isOpen: Bool { expanded.contains(id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 9) {
                // The preview toggle is its own control, so only the label area
                // takes the tap — nesting buttons would swallow one of them.
                if let onChoose {
                    Button(action: onChoose) { label }
                        .buttonStyle(.plain)
                        .disabled(disabled)
                } else {
                    label
                }
                Spacer(minLength: 0)
                if hasPreview {
                    Button { toggle(id, in: $expanded) } label: {
                        HStack(spacing: 3) {
                            Text(isOpen ? "Hide" : "Preview")
                            Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                                .font(.system(size: 8))
                        }
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ConversationStyle.verb)
                    }
                    .buttonStyle(.plain)
                }
            }
            // Collapsed by default: a preview is often a full file draft, and
            // three of them expanded would bury the question itself.
            if isOpen, let preview = option.preview {
                Text(preview)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(MCColor.foreground.opacity(0.72))
                    .textSelection(.enabled)
                    .padding(9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: MCRadius.sm, style: .continuous))
            }
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            selected ? ConversationStyle.accent.opacity(0.14) : MCColor.card,
            in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous)
                .stroke(selected ? ConversationStyle.accent.opacity(0.55) : Color.clear, lineWidth: 1)
        )
    }

    private var label: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: live
                  ? (selected ? "chevron.right.circle.fill" : "circle")
                  : (selected ? "checkmark.circle.fill" : "circle"))
                .font(.system(size: 14))
                .foregroundStyle(selected ? ConversationStyle.accent : MCColor.mutedForeground)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                // Numbered to match the terminal's own list, so "option 2"
                // means the same thing in both places.
                Text("\(number). \(option.label)")
                    .font(.caption.weight(selected ? .semibold : .regular))
                    .foregroundStyle(selected ? .white : MCColor.foreground.opacity(0.72))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let description = option.description, !description.isEmpty {
                    Text(description)
                        .font(.caption2)
                        .foregroundStyle(MCColor.mutedForeground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct ConversationFreeAnswerRow: View {
    let answer: String
    var title = "Your answer"

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(ConversationStyle.accent)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(MCColor.mutedForeground)
                Text(answer)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .textSelection(.enabled)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ConversationStyle.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous)
                .stroke(ConversationStyle.accent.opacity(0.55), lineWidth: 1)
        )
    }
}

struct ConversationStatusIcon: View {
    let status: String?

    var body: some View {
        switch status {
        case "ok":
            Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(MCColor.successForeground)
        case "error":
            Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(MCColor.errorForeground)
        default:
            Image(systemName: "circle").font(.system(size: 7)).foregroundStyle(MCColor.mutedForeground)
        }
    }
}

struct ConversationDiffView: View {
    let file: String?
    let diff: [ConversationDiffLine]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let file, !file.isEmpty {
                Text(conversationBasename(file))
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(MCColor.mutedForeground)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(MCColor.popover)
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
        .clipShape(RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous).stroke(MCColor.border))
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
        case "add": return MCColor.successForeground
        case "del": return MCColor.errorForeground
        default: return MCColor.mutedForeground
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

/// An open AskUserQuestion: the provider's exact questions, answerable in place.
/// Both surfaces answer by request id — the terminal cursor is never involved —
/// so this card is identical whether the agent runs in tmux or in a chat.
struct ConversationQuestionPrompt: View {
    let questions: [ConversationQuestion]
    @Binding var selections: [String: Set<String>]
    @Binding var customAnswers: [String: String]
    var submitting = false
    let onSubmit: ([String: String]) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 7) {
                Image(systemName: "questionmark.bubble.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(MCColor.warningForeground)
                Text("Waiting on you")
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(MCColor.warningForeground)
                Spacer(minLength: 4)
                Text(questions.count == 1 ? "QUESTION" : "\(questions.count) QUESTIONS")
                    .font(.caption2.monospaced().weight(.semibold))
                    .foregroundStyle(MCColor.mutedForeground)
            }

            ForEach(Array(questions.enumerated()), id: \.offset) { index, question in
                block(question, number: questions.count > 1 ? index + 1 : nil)
            }

            Button {
                if let answers { onSubmit(answers) }
            } label: {
                HStack(spacing: 7) {
                    if submitting { ProgressView().controlSize(.small) }
                    Text("Submit answer")
                        .font(.callout.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(MCColor.warningForeground)
            .disabled(submitting || answers == nil)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MCColor.popover, in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                .stroke(Color.orange.opacity(0.4), lineWidth: 1)
        )
    }

    /// Nil until every question has an answer — which is what disables Submit.
    private var answers: [String: String]? {
        var result: [String: String] = [:]
        for question in questions {
            let custom = (customAnswers[question.question] ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !custom.isEmpty {
                result[question.question] = custom
                continue
            }
            let picked = question.options.compactMap { option in
                selections[question.question]?.contains(option.label) == true ? option.label : nil
            }
            guard !picked.isEmpty else { return nil }
            result[question.question] = picked.joined(separator: ", ")
        }
        return result
    }

    private func block(_ question: ConversationQuestion, number: Int?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let header = question.header, !header.isEmpty {
                Text(number.map { "\($0). \(header)" } ?? header)
                    .font(.caption2.weight(.bold))
                    .kerning(0.6)
                    .foregroundStyle(MCColor.mutedForeground)
            }
            Text(question.question)
                .font(.callout)
                .foregroundStyle(MCColor.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)

            ForEach(Array(question.options.enumerated()), id: \.offset) { _, option in
                optionButton(option, question: question)
            }

            TextField(
                question.multiSelect == true ? "Or type another answer" : "Type another answer",
                text: customAnswerBinding(question.question)
            )
            .textFieldStyle(.roundedBorder)
            .font(.callout)

            if question.multiSelect == true {
                Text("Select one or more options.")
                    .font(.caption2)
                    .foregroundStyle(MCColor.mutedForeground)
            }
        }
    }

    private func optionButton(_ option: ConversationQuestionOption, question: ConversationQuestion) -> some View {
        let selected = selections[question.question]?.contains(option.label) == true
        return Button {
            var picked = selections[question.question] ?? []
            if question.multiSelect == true {
                if selected { picked.remove(option.label) } else { picked.insert(option.label) }
            } else {
                picked = [option.label]
            }
            selections[question.question] = picked
            customAnswers[question.question] = ""
        } label: {
            HStack(alignment: .top, spacing: 9) {
                Image(systemName: selected
                    ? (question.multiSelect == true ? "checkmark.square.fill" : "largecircle.fill.circle")
                    : (question.multiSelect == true ? "square" : "circle"))
                    .foregroundStyle(selected ? Color.orange : MCColor.mutedForeground)
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.label)
                        .font(.callout.weight(.medium))
                        .foregroundStyle(MCColor.foreground)
                    if let description = option.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(MCColor.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                selected ? Color.orange.opacity(0.12) : Color.black.opacity(0.18),
                in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous)
                    .stroke(selected ? Color.orange.opacity(0.55) : Color.white.opacity(0.08))
            )
        }
        .buttonStyle(.plain)
    }

    private func customAnswerBinding(_ question: String) -> Binding<String> {
        Binding(
            get: { customAnswers[question] ?? "" },
            set: { value in
                customAnswers[question] = value
                // Typing an answer replaces a pick rather than adding to it.
                if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    selections[question] = []
                }
            }
        )
    }
}

func conversationBasename(_ path: String) -> String {
    path.split(separator: "/").last.map(String.init) ?? path
}

private func toggle(_ id: String, in expanded: Binding<Set<String>>) {
    if expanded.wrappedValue.contains(id) {
        expanded.wrappedValue.remove(id)
    } else {
        expanded.wrappedValue.insert(id)
    }
}
