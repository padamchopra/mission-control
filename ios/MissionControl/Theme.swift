import SwiftUI

/// The design tokens every surface in this app resolves through.
///
/// Ported from T3 Code's `index.css`, whose comment on the geometry block names
/// the reason this file exists: keep the values semantic so "sidebar, palette,
/// tooltip, and toolbar controls cannot quietly drift apart." They had drifted:
/// 17 distinct corner radii and 14 font sizes were in use across this app, each
/// one a local judgement call, and the Mac chrome carried a second palette of
/// its own. A radius or a step is now a name, so a change lands everywhere or
/// nowhere.
///
/// Colours are the same values T3 renders, converted from oklch to sRGB rather
/// than matched by eye. Neutrals are Tailwind's zinc (light) and neutral (dark)
/// ramps; the accent is T3's indigo. Dark-mode separators and fills stay
/// translucent white exactly as `--alpha(var(--color-white) / 6%)` does, so
/// they lift off whatever surface they land on instead of banding against it.

// MARK: - Colour

/// A light/dark pair, resolved per trait collection so one declaration covers
/// both appearances and follows the system the moment it changes.
private func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
    })
}

/// A solid light value paired with a translucent white overlay for dark mode.
private func dynAlpha(_ light: UInt32, darkWhite: CGFloat) -> Color {
    Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 1, alpha: darkWhite)
            : UIColor(rgb: light)
    })
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

enum MCColor {
    // Canvas and content.
    static let background = dyn(0xFCFCFC, 0x0A0A0A)
    static let foreground = dyn(0x27272A, 0xF5F5F5)
    /// Lifts off `background`. Sidebar and inspector panels share it.
    static let card = dyn(0xFFFFFF, 0x111111)
    /// Lifts off `card` — menus, palettes, anything floating.
    static let popover = dyn(0xFFFFFF, 0x191919)

    // Accent.
    static let primary = dyn(0x1B4ED8, 0x346BF1)
    static let primaryForeground = Color.white

    // Quiet fills.
    static let secondary = dynAlpha(0xFAFAFA, darkWhite: 0.04)
    static let muted = dynAlpha(0xFAFAFA, darkWhite: 0.04)
    static let mutedForeground = dyn(0x71717B, 0x818181)
    static let accent = dynAlpha(0xF4F4F5, darkWhite: 0.04)
    static let accentForeground = dyn(0x18181B, 0xF5F5F5)

    // Separators and field edges.
    static let border = dynAlpha(0xE4E4E7, darkWhite: 0.06)
    static let input = dynAlpha(0xD4D4D8, darkWhite: 0.08)
    static var ring: Color { primary }

    // Status. `*Foreground` is the legible-on-surface variant; the bare token is
    // the dot, bar, or fill.
    static let success = dyn(0x00BC7D, 0x00BC7D)
    static let successForeground = dyn(0x007A55, 0x00D492)
    static let warning = dyn(0xFE9A00, 0xFE9A00)
    static let warningForeground = dyn(0xBB4D00, 0xFFB900)
    static let error = dyn(0xFB2C36, 0xFB414A)
    static let errorForeground = dyn(0xC10007, 0xFF6467)
    static let info = dyn(0x2B7FFF, 0x2B7FFF)
    static let infoForeground = dyn(0x1447E6, 0x51A2FF)
    static var destructive: Color { error }

    // Sidebar hierarchy. Kept as its own set because the sidebar sits one step
    // quieter than content on macOS, and rows need hover/selected states that
    // content never uses.
    static let sidebar = dyn(0xFAFAFA, 0x111111)
    static var sidebarForeground: Color { foreground }
    static var sidebarMutedForeground: Color { mutedForeground }
    static let sidebarControlSurface = dynAlpha(0xF4F4F5, darkWhite: 0.04)
    static let sidebarRowHover = dynAlpha(0xFCFCFC, darkWhite: 0.04)
    static let sidebarRowSelected = dynAlpha(0xFFFFFF, darkWhite: 0.06)
    static var sidebarBorder: Color { border }

    // Terminal. Its own tokens so a theme change can't wreck legibility on the
    // one surface where contrast is not negotiable.
    static let terminalBackground = dyn(0xFCFCFC, 0x0A0A0A)
    static let terminalForeground = dyn(0x27272A, 0xF5F5F5)
    static let terminalCursor = dyn(0x26384E, 0xB4CBFF)
}

// MARK: - Radius

/// T3's `--radius: 0.625rem` (10pt) and the ±4pt steps derived from it, plus
/// `--control-radius: 0.5rem` (8pt) which every button and field shares.
enum MCRadius {
    /// Inner corners — a swatch inside a chip, a 2pt selection bar.
    static let xs: CGFloat = 4
    static let sm: CGFloat = 6
    static let md: CGFloat = 8
    static let lg: CGFloat = 10
    static let xl: CGFloat = 14
    static let xxl: CGFloat = 18
    static let xxxl: CGFloat = 22
    /// Buttons, fields, chips. The one radius most controls should use.
    static let control: CGFloat = 8
    /// Fully rounded — pills and dots.
    static let full: CGFloat = 999
}

// MARK: - Spacing

/// A 2pt-quantised scale. `step` names come from T3's spacing utilities; the
/// named insets are its layout variables.
enum MCSpace {
    static let xxs: CGFloat = 2
    static let xs: CGFloat = 4
    static let sm: CGFloat = 6
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
    static let xxl: CGFloat = 20
    static let xxxl: CGFloat = 24
    static let huge: CGFloat = 32

    /// `--sidebar-content-inset`
    static let sidebarInset: CGFloat = 8
    /// `--sidebar-row-content-inset`
    static let sidebarRowInset: CGFloat = 10
    /// `--command-shell-inset`
    static let commandShellInset: CGFloat = 8
    /// `--command-content-inset`
    static let commandContentInset: CGFloat = 16
    /// `--floating-content-inset`
    static let floatingInset: CGFloat = 12
    /// `--workspace-topbar-height`
    static let topBarHeight: CGFloat = 52
}

// MARK: - Typography

/// T3 Code's type ladder, in points.
///
/// T3 sets the document root to 16px (`DEFAULT_INTERFACE_FONT_SIZE`), so its rem
/// utilities land on 12 / 14 / 16 / 18 / 20 / 24 / 30, and it fills in 10, 11 and
/// 13 with arbitrary values for dense metadata. On macOS a CSS pixel and a
/// SwiftUI point are both one logical pixel, so those numbers transfer directly.
///
/// The family is the system font, which is what T3 uses too — its
/// `--font-sans` is `-apple-system, BlinkMacSystemFont, …` and its `--font-mono`
/// is `"SF Mono", …`. It bundles no UI font, so matching it means asking for SF
/// properly rather than naming a font that isn't there. The Mac chrome used to
/// ask for `.custom("Inter", …)` and `.custom("Geist Mono", …)`; neither is
/// bundled and `UIAppFonts` is not declared, so both fell back to SF anyway.
enum MCFont {
    /// The rungs T3 actually uses. Legacy sizes snap to these so the app cannot
    /// drift back to fourteen different sizes.
    static let ladder: [CGFloat] = [10, 11, 12, 13, 14, 16, 18, 20, 24, 30]

    /// Nearest rung, ties resolving downward to keep dense UI dense.
    static func snap(_ size: CGFloat) -> CGFloat {
        var best = ladder[0]
        var bestDelta = CGFloat.greatestFiniteMagnitude
        for rung in ladder {
            let delta = abs(rung - size)
            if delta < bestDelta - 0.0001 {
                bestDelta = delta
                best = rung
            }
        }
        return best
    }

    /// The system font at `size`, scaled for the current Dynamic Type setting.
    ///
    /// Scaling matters because these tokens are used by the feed rows the phone
    /// shares with the Mac, and those rows previously used SwiftUI's text styles
    /// (`.callout`, `.caption`) which scale by default. A fixed-point token
    /// would have silently dropped that. On the Mac the default content size
    /// category is `.large`, so `scaledValue(for:)` returns `size` unchanged and
    /// the desktop layout stays exactly as specified.
    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: scaled(size), weight: weight)
    }

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: scaled(size), weight: weight, design: .monospaced)
    }

    private static func scaled(_ size: CGFloat) -> CGFloat {
        UIFontMetrics(forTextStyle: anchor(for: size)).scaledValue(for: size)
    }

    /// Small text scales on the caption curve and headings on a title curve, so
    /// a large accessibility setting doesn't flatten the hierarchy.
    private static func anchor(for size: CGFloat) -> UIFont.TextStyle {
        if size < 12 { return .caption1 }
        if size < 16 { return .body }
        if size < 20 { return .title3 }
        return .title1
    }

    // The steps, mapped onto T3's rungs. Computed rather than stored so each one
    // re-reads the current Dynamic Type setting instead of freezing it at launch.

    /// Dense metadata — device codes, counts, gutter numbers. T3's `text-[10px]`.
    static var micro: Font { sans(10, .medium) }
    /// Timestamps and badge text. T3's `text-[11px]`.
    static var caption: Font { sans(11) }
    static var captionStrong: Font { sans(11, .medium) }
    /// Secondary rows, chips, toolbar labels. T3's `text-xs` — its workhorse.
    static var footnote: Font { sans(12) }
    static var footnoteStrong: Font { sans(12, .medium) }
    /// Default body and control label. T3's `text-sm`: its chat prose and the
    /// label on every button at the desktop breakpoint.
    static var body: Font { sans(14) }
    static var bodyStrong: Font { sans(14, .medium) }
    /// Row titles and anything that should read one step up from body.
    static var callout: Font { sans(16) }
    static var calloutStrong: Font { sans(16, .semibold) }
    /// Section headings.
    static var headline: Font { sans(18, .semibold) }
    static var title3: Font { sans(20, .semibold) }
    static var title2: Font { sans(24, .semibold) }
    static var title1: Font { sans(30, .bold) }
    static var display: Font { sans(30, .bold) }

    /// Paths, commands, diffs. SF Mono, the family T3 names first.
    static var monoMicro: Font { mono(10) }
    static var monoCaption: Font { mono(11) }
    static var monoBody: Font { mono(12) }
    static var monoCode: Font { mono(13) }

    /// The all-caps group header above a list section.
    static var sectionLabel: Font { sans(11, .semibold) }
}

// MARK: - Control metrics

/// Control heights and their matching padding, font, and glyph size, so a
/// button, a field, and a chip on the same row line up without hand-tuning.
///
/// These are T3's desktop values. Its button variants are written
/// mobile-first — `h-9 … sm:h-8`, `text-base sm:text-sm` — so the numbers that
/// apply on a desktop window are the `sm:` ones: 24 / 28 / 32 / 36 / 40, with
/// `px-[calc(--spacing(n)-1px)]` horizontal padding and 16pt glyphs.
enum MCControlSize {
    case xs, sm, md, lg, xl

    /// T3: `size-7 sm:size-6`, `h-8 sm:h-7`, `h-9 sm:h-8`, `h-10 sm:h-9`,
    /// `h-11 sm:h-10`.
    var height: CGFloat {
        switch self {
        case .xs: return 24
        case .sm: return 28
        case .md: return 32
        case .lg: return 36
        case .xl: return 40
        }
    }

    /// The `-1px` in T3's padding accounts for the border, which is drawn inside
    /// the frame here too.
    var horizontalPadding: CGFloat {
        switch self {
        case .xs: return 7
        case .sm: return 9
        case .md: return 11
        case .lg: return 13
        case .xl: return 15
        }
    }

    var font: Font {
        switch self {
        case .xs, .sm: return MCFont.footnoteStrong
        case .md, .lg: return MCFont.bodyStrong
        case .xl: return MCFont.calloutStrong
        }
    }

    /// T3's `[&_svg]:size-4.5 sm:size-4` — 16pt on desktop, 14 for the compact
    /// sizes.
    var iconSize: CGFloat {
        switch self {
        case .xs: return 14
        case .sm: return 14
        case .md: return 16
        case .lg: return 16
        case .xl: return 18
        }
    }

    var radius: CGFloat {
        switch self {
        case .xs: return MCRadius.sm
        case .sm, .md, .lg: return MCRadius.control
        case .xl: return MCRadius.lg
        }
    }

    /// Gap between a glyph and its label. T3's `gap-1` / `gap-1.5` / `gap-2`.
    var gap: CGFloat {
        switch self {
        case .xs: return 4
        case .sm: return 6
        case .md, .lg, .xl: return 8
        }
    }
}

// MARK: - Motion

/// T3 animates the composer morph over 180ms on `cubic-bezier(0.4, 0, 0.2, 1)`
/// and crossfades internals over 130ms. Same curve, same durations, so motion
/// reads as one system rather than per-view guesses.
enum MCMotion {
    static var fast: Animation { .timingCurve(0.4, 0, 0.2, 1, duration: 0.13) }
    static var standard: Animation { .timingCurve(0.4, 0, 0.2, 1, duration: 0.18) }
    static var slow: Animation { .timingCurve(0.4, 0, 0.2, 1, duration: 0.24) }
    /// State badges and progress pulses.
    static var pulse: Animation { .easeInOut(duration: 1.0).repeatForever(autoreverses: true) }
}

// MARK: - Surfaces

extension View {
    /// A floating surface: palette, menu, dialog.
    ///
    /// Clips before drawing the border, because the content inside these panels
    /// paints its own square backgrounds — a dialog's action bar, the command
    /// palette's footer — and without a clip those corners overpaint the rounded
    /// ones and the panel reads as a rectangle with a hairline arc on it.
    func mcFloating(radius: CGFloat = MCRadius.xl) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return background(MCColor.popover)
            .clipShape(shape)
            .overlay(shape.strokeBorder(MCColor.border, lineWidth: 1))
            .shadow(color: .black.opacity(0.28), radius: 24, y: 12)
    }

    /// An inline panel that lifts one step off the canvas.
    func mcCard(radius: CGFloat = MCRadius.lg, fill: Color = MCColor.card) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return background(fill)
            .clipShape(shape)
            .overlay(shape.strokeBorder(MCColor.border, lineWidth: 1))
    }

    /// A hairline in the token colour, for use as a row or header separator.
    func mcSeparator(_ edge: Alignment = .bottom) -> some View {
        overlay(alignment: edge) {
            Rectangle()
                .fill(MCColor.border)
                .frame(height: 1)
        }
    }
}
