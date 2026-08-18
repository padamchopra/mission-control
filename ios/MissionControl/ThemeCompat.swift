import SwiftUI

/// Bridges the two palettes this app used to carry onto the single token set in
/// `Theme.swift`.
///
/// There were two, with the same literals pasted into each: `FlightDeckPalette`
/// behind `#if targetEnvironment(macCatalyst)` and `MobileFlightDeckPalette`
/// behind `#if !targetEnvironment(macCatalyst)`. They had already drifted — the
/// Mac set had `sidebar`/`chrome`/`conversation`, the mobile set had
/// `accentBorder`, and the shared feed in `ConversationRows` picked amber on Mac
/// where it picked green on iPhone for the same state. Because both names are
/// now one type, every `#if` that existed only to choose between them is dead,
/// and the two platforms cannot diverge again.
///
/// This exists so ~1,000 call sites did not have to change in the same commit
/// that introduces the tokens. New code should use `MCColor` and `MCFont`
/// directly; this shim is here to be deleted a file at a time.
enum FlightDeckPalette {
    static var background: Color { MCColor.background }
    static var sidebar: Color { MCColor.sidebar }
    static var surface: Color { MCColor.card }
    static var chrome: Color { MCColor.card }
    /// A surface one step above `card` — selected rows, raised wells.
    static var raised: Color { MCColor.popover }
    static var terminal: Color { MCColor.terminalBackground }
    static var border: Color { MCColor.border }
    static var strongBorder: Color { MCColor.input }
    static var accentBorder: Color { MCColor.primary.opacity(0.35) }
    static var text: Color { MCColor.foreground }
    static var secondary: Color { MCColor.mutedForeground }
    static var muted: Color { MCColor.mutedForeground.opacity(0.7) }
    /// Was a cream emphasis colour; only ever used on text.
    static var warm: Color { MCColor.foreground.opacity(0.85) }
    /// The app's accent. Named `amber` because it used to be — it fills accent
    /// buttons, selection bars, and active borders, so it maps to `primary`
    /// rather than to the warning tone.
    static var amber: Color { MCColor.primary }
    static var green: Color { MCColor.successForeground }
    static var red: Color { MCColor.errorForeground }
    /// Text and glyphs drawn on top of `amber`.
    static var onAccent: Color { MCColor.primaryForeground }
}

/// The mobile app's half of the old duplication. Same type, so the two can no
/// longer disagree.
typealias MobileFlightDeckPalette = FlightDeckPalette

extension Font {
    /// The old Mac type ramp, now resolving to real point sizes.
    ///
    /// It used to remap every request through a table that inflated small sizes
    /// — `flightSans(11)` rendered at 17pt — to compensate for asking for
    /// `.custom("Inter", …)`, a font that was never bundled and never declared
    /// in `UIAppFonts`, so it silently fell back to San Francisco anyway. The
    /// mobile twins (`mobileDeckSans`/`mobileDeckMono`) had no such table, which
    /// is why a shared view rendered at different sizes on Mac and iPhone.
    ///
    /// Sizes now pass through, floored so nothing lands below the smallest
    /// legible step in `MCFont`.
    static func flightSans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        MCFont.sans(max(size, 10), weight)
    }

    static func flightMono(_ size: CGFloat, weight: Weight = .regular) -> Font {
        MCFont.mono(max(size, 10.5), weight)
    }

    static func mobileDeckSans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        flightSans(size, weight: weight)
    }

    static func mobileDeckMono(_ size: CGFloat, weight: Weight = .regular) -> Font {
        flightMono(size, weight: weight)
    }
}
