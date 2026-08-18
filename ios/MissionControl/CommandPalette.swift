import SwiftUI

/// The ⌘K palette: one keyboard route to every session, chat, and destination.
///
/// The palette this replaces listed sessions only, had no arrow-key handling,
/// and needed the mouse to pick anything but the first hit. This one takes a
/// flat list of items from the caller and owns the parts that should not be
/// reinvented per call site: matching, grouping, selection, and key handling.
/// Anything addressable can be an item, so adding a destination is a line of
/// data rather than a new view.

// MARK: - Item

struct MCCommandItem: Identifiable {
    let id: String
    /// The group heading this item sorts under. Groups render in first-seen
    /// order, so the caller controls precedence by ordering the array.
    let group: String
    let title: String
    var subtitle: String? = nil
    var icon: String = "arrow.right"
    /// Tints the glyph — used to carry session state into the palette.
    var tint: Color? = nil
    /// A trailing status pill.
    var badge: String? = nil
    var badgeTone: MCBadgeTone = .neutral
    /// Shown right-aligned as keycaps. Display only; the caller registers the
    /// real shortcut.
    var shortcut: [String]? = nil
    /// Extra text to match against that is not displayed — a path, a branch, a
    /// command line.
    var keywords: String = ""
    let run: () -> Void
}

// MARK: - Matching

/// Subsequence matching with a score, so "fdv" finds "FlightDeckView" but an
/// exact prefix still wins. Scoring beats plain `contains` here because the
/// things being searched are mostly paths and session names, where the useful
/// characters are spread across word boundaries.
enum MCCommandMatch {
    static func score(_ candidate: String, query: String) -> Int? {
        if query.isEmpty { return 0 }
        let haystack = Array(candidate.lowercased())
        let needle = Array(query.lowercased())
        var score = 0
        var haystackIndex = 0
        var previousMatch = -1

        for character in needle {
            var found = false
            while haystackIndex < haystack.count {
                if haystack[haystackIndex] == character {
                    // Adjacent matches and matches at a word boundary are what
                    // a person actually means when they type an abbreviation.
                    if previousMatch == haystackIndex - 1 { score += 8 }
                    if haystackIndex == 0 { score += 12 }
                    else if isBoundary(haystack[haystackIndex - 1]) { score += 10 }
                    score += 1
                    previousMatch = haystackIndex
                    haystackIndex += 1
                    found = true
                    break
                }
                haystackIndex += 1
            }
            if !found { return nil }
        }
        // Prefer tight matches in short strings over the same hit buried in a
        // long path.
        return score - (haystack.count / 24)
    }

    private static func isBoundary(_ character: Character) -> Bool {
        character == " " || character == "/" || character == "-" || character == "_"
            || character == "." || character == ":"
    }

    /// Best score across the fields worth searching, so a path hit still ranks
    /// the item but never outranks a title hit.
    static func score(_ item: MCCommandItem, query: String) -> Int? {
        let candidates: [(String, Int)] = [
            (item.title, 0),
            (item.subtitle ?? "", -6),
            (item.keywords, -10),
            (item.group, -14),
        ]
        return candidates.compactMap { text, penalty in
            text.isEmpty ? nil : score(text, query: query).map { $0 + penalty }
        }.max()
    }
}

// MARK: - Palette

struct MCCommandPalette: View {
    let items: [MCCommandItem]
    var placeholder = "Search sessions, chats, and commands"
    /// Shown in the footer before anything has been typed.
    var hint: String? = nil
    let onDismiss: () -> Void

    @State private var query = ""
    @State private var selection = 0

    /// Filtered results plus the grouped view of them, resolved together.
    ///
    /// One value rather than two computed properties because a row needs its
    /// index in the flat list to know whether it is selected. Deriving that per
    /// row meant recomputing and re-scoring the whole list for every row drawn.
    private struct Display {
        var flat: [MCCommandItem] = []
        var groups: [(name: String, rows: [(index: Int, item: MCCommandItem)])] = []
    }

    private var display: Display {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let flat: [MCCommandItem]
        if term.isEmpty {
            flat = items
        } else {
            flat = items
                .compactMap { item in MCCommandMatch.score(item, query: term).map { (item, $0) } }
                .sorted { $0.1 > $1.1 }
                .map(\.0)
        }

        var order: [String] = []
        var buckets: [String: [(index: Int, item: MCCommandItem)]] = [:]
        for (index, item) in flat.enumerated() {
            if buckets[item.group] == nil { order.append(item.group) }
            buckets[item.group, default: []].append((index: index, item: item))
        }
        return Display(flat: flat, groups: order.map { (name: $0, rows: buckets[$0] ?? []) })
    }

    var body: some View {
        let display = self.display
        return VStack(spacing: 0) {
            field
            Divider().overlay(MCColor.border)
            if display.flat.isEmpty {
                emptyState
            } else {
                list(display)
            }
            Divider().overlay(MCColor.border)
            footer(count: display.flat.count)
        }
        .frame(width: 620)
        .frame(maxHeight: 520)
        .mcFloating()
        .onChange(of: query) { _, _ in selection = 0 }
    }

    // MARK: Field

    private var field: some View {
        HStack(spacing: MCSpace.md) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(MCColor.mutedForeground)

            // A UIKit field rather than SwiftUI's: while a text field owns first
            // responder it consumes the arrow keys to move its caret, and
            // `PasteTextView` already records that SwiftUI shortcuts "do not
            // reliably win" against it. Owning the key commands on the responder
            // itself is the part that makes up and down work at all.
            MCPaletteField(
                text: $query,
                placeholder: placeholder,
                onMoveUp: { move(by: -1) },
                onMoveDown: { move(by: 1) },
                onSubmit: runSelection,
                onCancel: onDismiss
            )
            .frame(height: 24)

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                }
                .buttonStyle(.mcIcon(.ghostMuted, size: .xs))
            }
        }
        .padding(.horizontal, MCSpace.commandContentInset)
        .frame(height: 48)
    }

    // MARK: List

    private func list(_ display: Display) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: MCSpace.lg) {
                    ForEach(display.groups, id: \.name) { group in
                        VStack(alignment: .leading, spacing: 1) {
                            MCSectionLabel(text: group.name)
                                .padding(.horizontal, MCSpace.md)
                                .padding(.bottom, MCSpace.xs)

                            ForEach(group.rows, id: \.item.id) { row in
                                self.row(row.item, index: row.index)
                                    .id(row.item.id)
                            }
                        }
                    }
                }
                .padding(MCSpace.commandShellInset)
            }
            .onChange(of: selection) { _, index in
                let flat = display.flat
                guard flat.indices.contains(index) else { return }
                withAnimation(MCMotion.fast) { proxy.scrollTo(flat[index].id, anchor: .center) }
            }
        }
    }

    private func row(_ item: MCCommandItem, index: Int) -> some View {
        let isSelected = index == selection

        return Button {
            onDismiss()
            item.run()
        } label: {
            HStack(spacing: MCSpace.lg) {
                Image(systemName: item.icon)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(item.tint ?? MCColor.mutedForeground)
                    .frame(width: 16)

                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title)
                        .font(MCFont.bodyStrong)
                        .foregroundStyle(MCColor.foreground)
                        .lineLimit(1)
                    if let subtitle = item.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(MCFont.caption)
                            .foregroundStyle(MCColor.mutedForeground)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }

                Spacer(minLength: MCSpace.md)

                if let badge = item.badge {
                    MCBadge(text: badge, tone: item.badgeTone)
                }
                if let shortcut = item.shortcut {
                    MCKbd(keys: shortcut)
                }
            }
            .padding(.horizontal, MCSpace.sidebarRowInset)
            .frame(height: 40)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous)
                    .fill(isSelected ? MCColor.accent : .clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        // Hovering moves the selection, so mouse and keyboard cannot disagree
        // about what Return will do.
        .onHover { hovering in
            if hovering { selection = index }
        }
    }

    private var emptyState: some View {
        VStack(spacing: MCSpace.md) {
            Text("No matches")
                .font(MCFont.bodyStrong)
                .foregroundStyle(MCColor.foreground)
            Text("Try a session name, a folder, or a chat title.")
                .font(MCFont.footnote)
                .foregroundStyle(MCColor.mutedForeground)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 180)
    }

    // MARK: Footer

    private func footer(count: Int) -> some View {
        HStack(spacing: MCSpace.lg) {
            if let hint, query.isEmpty {
                Text(hint)
                    .font(MCFont.caption)
                    .foregroundStyle(MCColor.mutedForeground)
                    .lineLimit(1)
            } else {
                Text("\(count) result\(count == 1 ? "" : "s")")
                    .font(MCFont.caption)
                    .foregroundStyle(MCColor.mutedForeground)
            }

            Spacer(minLength: MCSpace.md)

            legend(keys: ["↑", "↓"], "Navigate")
            legend(keys: ["↵"], "Open")
            legend(keys: ["esc"], "Close")
        }
        .padding(.horizontal, MCSpace.commandContentInset)
        .frame(height: 40)
        .background(MCColor.muted)
    }

    private func legend(keys: [String], _ label: String) -> some View {
        HStack(spacing: MCSpace.xs) {
            MCKbd(keys: keys)
            Text(label)
                .font(MCFont.micro)
                .foregroundStyle(MCColor.mutedForeground)
        }
    }

    // MARK: Keyboard

    private func runSelection() {
        let flat = display.flat
        guard flat.indices.contains(selection) else { return }
        let item = flat[selection]
        onDismiss()
        item.run()
    }

    private func move(by offset: Int) {
        let count = display.flat.count
        guard count > 0 else { return }
        // Clamped rather than wrapped: holding an arrow key should rest at an
        // end instead of cycling past it.
        selection = min(max(selection + offset, 0), count - 1)
    }
}

// MARK: - Field

/// The palette's search field.
///
/// Wrapping UIKit buys the one thing SwiftUI cannot give here: `keyCommands` on
/// the responder that actually has focus, with `wantsPriorityOverSystemBehavior`
/// so ↑↓ drive the result list instead of the caret.
private struct MCPaletteField: UIViewRepresentable {
    @Binding var text: String
    let placeholder: String
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onSubmit: () -> Void
    let onCancel: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> PaletteTextField {
        let field = PaletteTextField()
        field.delegate = context.coordinator
        field.borderStyle = .none
        field.backgroundColor = .clear
        field.font = .systemFont(ofSize: 14)
        field.textColor = UIColor { traits in
            traits.userInterfaceStyle == .dark ? .white : UIColor(white: 0.15, alpha: 1)
        }
        field.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: UIColor.secondaryLabel, .font: UIFont.systemFont(ofSize: 14)]
        )
        field.returnKeyType = .go
        // Paths and session names — every assist here would corrupt input.
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.smartQuotesType = .no
        field.smartDashesType = .no
        field.smartInsertDeleteType = .no
        field.inlinePredictionType = .no
        field.clearButtonMode = .never
        field.addTarget(
            context.coordinator,
            action: #selector(Coordinator.editingChanged(_:)),
            for: .editingChanged
        )
        field.bind(onMoveUp: onMoveUp, onMoveDown: onMoveDown, onCancel: onCancel)
        return field
    }

    func updateUIView(_ uiView: PaletteTextField, context: Context) {
        context.coordinator.parent = self
        if uiView.text != text { uiView.text = text }
        uiView.bind(onMoveUp: onMoveUp, onMoveDown: onMoveDown, onCancel: onCancel)
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: MCPaletteField

        init(_ parent: MCPaletteField) { self.parent = parent }

        @objc func editingChanged(_ field: UITextField) {
            parent.text = field.text ?? ""
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            parent.onSubmit()
            return false
        }
    }
}

final class PaletteTextField: UITextField {
    private var onMoveUp: (() -> Void)?
    private var onMoveDown: (() -> Void)?
    private var onCancel: (() -> Void)?

    func bind(onMoveUp: @escaping () -> Void, onMoveDown: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.onMoveUp = onMoveUp
        self.onMoveDown = onMoveDown
        self.onCancel = onCancel
    }

    /// Focus here rather than from `makeUIView`. A view has no window at the
    /// point SwiftUI builds it, and `becomeFirstResponder()` fails outright off
    /// the window — which is why the palette could open unfocused, leaving
    /// nowhere for keystrokes to land.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !isFirstResponder else { return }
        becomeFirstResponder()
    }

    override var keyCommands: [UIKeyCommand]? {
        let up = UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(moveUp))
        let down = UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(moveDown))
        // Without this the field moves its own caret and the list never sees the
        // key. Escape is left at default priority so the system can still use it.
        up.wantsPriorityOverSystemBehavior = true
        down.wantsPriorityOverSystemBehavior = true
        return [
            up,
            down,
            UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(cancel)),
            // Control-N/P as well: they never collide with caret movement, and
            // they keep working if a future OS reclaims the bare arrows.
            UIKeyCommand(input: "n", modifierFlags: .control, action: #selector(moveDown)),
            UIKeyCommand(input: "p", modifierFlags: .control, action: #selector(moveUp)),
        ]
    }

    @objc private func moveUp() { onMoveUp?() }
    @objc private func moveDown() { onMoveDown?() }
    @objc private func cancel() { onCancel?() }
}

// MARK: - Host

extension View {
    /// Presents the palette as a centred overlay with a dimmed backdrop.
    ///
    /// An overlay rather than a `sheet`, because a Catalyst sheet animates in
    /// from the top edge and takes the window's focus ring with it — wrong for
    /// something meant to feel instant.
    func mcCommandPalette(
        isPresented: Binding<Bool>,
        items: @escaping () -> [MCCommandItem],
        placeholder: String = "Search sessions, chats, and commands",
        hint: String? = nil
    ) -> some View {
        overlay {
            if isPresented.wrappedValue {
                MCCommandPaletteHost(
                    isPresented: isPresented,
                    items: items(),
                    placeholder: placeholder,
                    hint: hint
                )
            }
        }
        // The transition inside the host needs an animation driving it, or the
        // palette cuts in on one frame.
        .animation(MCMotion.fast, value: isPresented.wrappedValue)
    }
}

private struct MCCommandPaletteHost: View {
    @Binding var isPresented: Bool
    let items: [MCCommandItem]
    let placeholder: String
    let hint: String?

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.opacity(0.32)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { isPresented = false }

            MCCommandPalette(
                items: items,
                placeholder: placeholder,
                hint: hint,
                onDismiss: { isPresented = false }
            )
            // Sits high rather than centred: the eye is already near the top of
            // the window, and the results grow downward without shifting.
            .padding(.top, 96)
        }
        .transition(.opacity)
        .zIndex(200)
    }
}
