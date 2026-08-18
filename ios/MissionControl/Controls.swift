import SwiftUI

/// The control primitives every surface builds from.
///
/// T3 Code keeps ~55 of these in `components/ui`, each a thin wrapper that
/// resolves variant plus size into one set of tokens. That is the part worth
/// copying: a button's look is decided once, here, so a new view cannot invent
/// a fifth shade of "secondary". Variants and sizes are named after theirs so
/// the two codebases stay easy to read side by side.

// MARK: - Button

enum MCButtonVariant {
    /// The one affirmative action on a surface.
    case primary
    /// Neutral but present — the common toolbar button.
    case secondary
    /// Bordered and transparent, for actions that sit over content.
    case outline
    /// No chrome until hovered. Icon buttons and row affordances.
    case ghost
    /// Quiet ghost: muted label that lifts to full contrast on hover.
    case ghostMuted
    /// Irreversible actions.
    case destructive
    /// Bordered, error-coloured label — a destructive action that is not the
    /// primary one on its surface.
    case destructiveOutline
}

/// A button whose fill, border, and label colour come from the token set.
struct MCButtonStyle: ButtonStyle {
    var variant: MCButtonVariant = .secondary
    var size: MCControlSize = .md
    /// Square, for a glyph with no label.
    var iconOnly = false
    /// Renders as though held — for toggles and menu anchors that are open.
    var pressedLook = false

    func makeBody(configuration: Configuration) -> some View {
        // The body is a real `View` rather than inline modifiers so it can read
        // `isEnabled` and track hover. A `ButtonStyle` is not a `View`, so
        // `@Environment` and `@State` do not belong on the style itself.
        MCButtonBody(
            label: configuration.label,
            held: configuration.isPressed || pressedLook,
            variant: variant,
            size: size,
            iconOnly: iconOnly
        )
    }
}

private struct MCButtonBody<Label: View>: View {
    let label: Label
    let held: Bool
    let variant: MCButtonVariant
    let size: MCControlSize
    let iconOnly: Bool

    @Environment(\.isEnabled) private var isEnabled
    @State private var hovering = false

    var body: some View {
        let active = held || hovering
        label
            .font(size.font)
            .foregroundStyle(labelColor(active: active))
            .frame(height: size.height)
            .frame(minWidth: iconOnly ? size.height : nil)
            .padding(.horizontal, iconOnly ? 0 : size.horizontalPadding)
            .background(fill(held: held, hovering: hovering), in: shape)
            .overlay(shape.strokeBorder(border(active: active), lineWidth: 1))
            .opacity(isEnabled ? 1 : 0.4)
            .contentShape(shape)
            .onHover { hovering = isEnabled && $0 }
            .animation(MCMotion.fast, value: active)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: size.radius, style: .continuous)
    }

    private func fill(held: Bool, hovering: Bool) -> Color {
        switch variant {
        case .primary:
            if held { return MCColor.primary.opacity(0.82) }
            return hovering ? MCColor.primary.opacity(0.92) : MCColor.primary
        case .destructive:
            if held { return MCColor.destructive.opacity(0.82) }
            return hovering ? MCColor.destructive.opacity(0.92) : MCColor.destructive
        case .secondary:
            return (held || hovering) ? MCColor.accent : MCColor.secondary
        case .outline, .destructiveOutline, .ghost, .ghostMuted:
            return (held || hovering) ? MCColor.accent : .clear
        }
    }

    private func border(active: Bool) -> Color {
        switch variant {
        case .primary: return MCColor.primary
        case .destructive: return MCColor.destructive
        case .secondary, .outline: return MCColor.border
        case .destructiveOutline: return active ? MCColor.destructive.opacity(0.4) : MCColor.border
        case .ghost, .ghostMuted: return .clear
        }
    }

    private func labelColor(active: Bool) -> Color {
        switch variant {
        case .primary, .destructive: return MCColor.primaryForeground
        case .secondary, .outline: return MCColor.foreground
        case .destructiveOutline: return MCColor.errorForeground
        case .ghost: return MCColor.foreground
        case .ghostMuted: return active ? MCColor.foreground : MCColor.mutedForeground
        }
    }
}

extension ButtonStyle where Self == MCButtonStyle {
    static func mc(
        _ variant: MCButtonVariant = .secondary,
        size: MCControlSize = .md,
        iconOnly: Bool = false
    ) -> MCButtonStyle {
        MCButtonStyle(variant: variant, size: size, iconOnly: iconOnly)
    }

    /// A square glyph button — the toolbar workhorse.
    static func mcIcon(_ variant: MCButtonVariant = .ghost, size: MCControlSize = .md) -> MCButtonStyle {
        MCButtonStyle(variant: variant, size: size, iconOnly: true)
    }
}

// MARK: - Badge

enum MCBadgeTone {
    case neutral, primary, success, warning, error, info

    var foreground: Color {
        switch self {
        case .neutral: return MCColor.mutedForeground
        case .primary: return MCColor.primary
        case .success: return MCColor.successForeground
        case .warning: return MCColor.warningForeground
        case .error: return MCColor.errorForeground
        case .info: return MCColor.infoForeground
        }
    }

    /// A tint of the tone, matching T3's `color-mix(… 8%, transparent)` surfaces.
    var surface: Color {
        switch self {
        case .neutral: return MCColor.muted
        case .primary: return MCColor.primary.opacity(0.12)
        case .success: return MCColor.success.opacity(0.14)
        case .warning: return MCColor.warning.opacity(0.16)
        case .error: return MCColor.error.opacity(0.14)
        case .info: return MCColor.info.opacity(0.14)
        }
    }
}

/// A small status pill. `dot` prefixes a filled circle, for live state.
struct MCBadge: View {
    let text: String
    var tone: MCBadgeTone = .neutral
    var dot = false

    var body: some View {
        HStack(spacing: MCSpace.xs) {
            if dot {
                Circle()
                    .fill(tone.foreground)
                    .frame(width: 5, height: 5)
            }
            Text(text)
                .font(MCFont.micro)
                .lineLimit(1)
        }
        .foregroundStyle(tone.foreground)
        .padding(.horizontal, MCSpace.sm)
        .padding(.vertical, 3)
        .background(tone.surface, in: Capsule(style: .continuous))
    }
}

/// A metadata chip: a glyph and a value, no tone. Used for model, permission
/// mode, branch, and path in headers.
struct MCChip: View {
    var icon: String? = nil
    let text: String
    var mono = false

    var body: some View {
        HStack(spacing: MCSpace.xs) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 9, weight: .semibold))
            }
            Text(text)
                .font(mono ? MCFont.monoCaption : MCFont.captionStrong)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .foregroundStyle(MCColor.mutedForeground)
        .padding(.horizontal, MCSpace.sm)
        .frame(height: 20)
        .background(MCColor.muted, in: RoundedRectangle(cornerRadius: MCRadius.sm, style: .continuous))
    }
}

// MARK: - Keyboard hint

/// A keycap, for shortcut hints in the palette and menus.
struct MCKbd: View {
    let keys: [String]

    init(_ keys: String...) { self.keys = keys }
    init(keys: [String]) { self.keys = keys }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(keys.enumerated()), id: \.offset) { _, key in
                Text(key)
                    .font(MCFont.micro)
                    .foregroundStyle(MCColor.mutedForeground)
                    .frame(minWidth: 16)
                    .frame(height: 16)
                    .padding(.horizontal, 3)
                    .background(
                        RoundedRectangle(cornerRadius: MCRadius.sm - 2, style: .continuous)
                            .fill(MCColor.muted)
                            .overlay(
                                RoundedRectangle(cornerRadius: MCRadius.sm - 2, style: .continuous)
                                    .strokeBorder(MCColor.border, lineWidth: 1)
                            )
                    )
            }
        }
    }
}

// MARK: - Field

/// A text field on the token set. Focus draws the ring rather than shifting
/// layout, so a focused field cannot nudge its neighbours.
struct MCFieldStyle: TextFieldStyle {
    var size: MCControlSize = .md
    var focused = false
    var mono = false

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(mono ? MCFont.monoBody : MCFont.body)
            .foregroundStyle(MCColor.foreground)
            .padding(.horizontal, size.horizontalPadding)
            .frame(height: size.height)
            .background(
                MCColor.card,
                in: RoundedRectangle(cornerRadius: size.radius, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: size.radius, style: .continuous)
                    .strokeBorder(focused ? MCColor.ring : MCColor.input, lineWidth: focused ? 2 : 1)
            )
            .animation(MCMotion.fast, value: focused)
    }
}

// MARK: - Section label

/// The quiet all-caps heading over a group of rows.
struct MCSectionLabel: View {
    let text: String
    var trailing: String? = nil

    var body: some View {
        HStack(spacing: MCSpace.sm) {
            Text(text.uppercased())
                .font(MCFont.sectionLabel)
                .tracking(0.6)
            if let trailing {
                Text(trailing)
                    .font(MCFont.micro)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(MCColor.mutedForeground)
    }
}

// MARK: - Spinner

/// An indeterminate spinner that matches the type scale, since
/// `ProgressView`'s own sizing ignores it.
struct MCSpinner: View {
    var size: CGFloat = 12
    var tint: Color = MCColor.mutedForeground

    @State private var spinning = false

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.72)
            .stroke(tint, style: StrokeStyle(lineWidth: max(1.2, size / 9), lineCap: .round))
            .frame(width: size, height: size)
            .rotationEffect(.degrees(spinning ? 360 : 0))
            .onAppear {
                withAnimation(.linear(duration: 0.85).repeatForever(autoreverses: false)) {
                    spinning = true
                }
            }
    }
}

// MARK: - Empty state

/// The centred glyph-title-message block shown when a list has nothing in it.
struct MCEmptyState<Actions: View>: View {
    let icon: String
    let title: String
    var message: String? = nil
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(spacing: MCSpace.lg) {
            Image(systemName: icon)
                .font(.system(size: 26, weight: .light))
                .foregroundStyle(MCColor.mutedForeground.opacity(0.7))
            VStack(spacing: MCSpace.sm) {
                Text(title)
                    .font(MCFont.headline)
                    .foregroundStyle(MCColor.foreground)
                if let message {
                    Text(message)
                        .font(MCFont.footnote)
                        .foregroundStyle(MCColor.mutedForeground)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            actions()
        }
        .frame(maxWidth: 320)
        .padding(MCSpace.huge)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension MCEmptyState where Actions == EmptyView {
    init(icon: String, title: String, message: String? = nil) {
        self.init(icon: icon, title: title, message: message, actions: { EmptyView() })
    }
}

// MARK: - Row

/// A selectable list row with the sidebar's hover and selected treatment.
/// Hover is real on macOS and inert on iOS, which is why it is a token here
/// rather than a per-view `onHover`.
struct MCRow<Content: View>: View {
    var selected = false
    var action: (() -> Void)?
    @ViewBuilder var content: () -> Content

    @State private var hovering = false

    var body: some View {
        let rowBody = content()
            .padding(.horizontal, MCSpace.sidebarRowInset)
            .padding(.vertical, MCSpace.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
            .onHover { hovering = $0 }
            .animation(MCMotion.fast, value: hovering)
            .animation(MCMotion.fast, value: selected)

        if let action {
            Button(action: action) { rowBody }
                .buttonStyle(.plain)
        } else {
            rowBody
        }
    }

    private var fill: Color {
        if selected { return MCColor.sidebarRowSelected }
        return hovering ? MCColor.sidebarRowHover : .clear
    }
}

// MARK: - Toolbar

/// The 52pt top bar T3 uses on every workspace pane, with a hairline under it.
struct MCToolbar<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(spacing: MCSpace.md, content: content)
            .padding(.horizontal, MCSpace.lg)
            .frame(height: MCSpace.topBarHeight)
            .background(MCColor.card)
            .mcSeparator()
    }
}
