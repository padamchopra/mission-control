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
    /// The old Mac and mobile type ramps, re-pointed at T3's ladder.
    ///
    /// Two things had to be true at once here, and the obvious approach fails
    /// both.
    ///
    /// First, these functions never rendered the size they were handed. The Mac
    /// ramp ran every request through a table that *inflated* it —
    ///
    ///     case ...9: 15    case ...10: 16    case ...11: 17
    ///     case ...12: 18   default: size * 1.25
    ///
    /// — to compensate for asking for `.custom("Inter", …)`, a font that is not
    /// bundled and not declared in `UIAppFonts`, so it fell back to San
    /// Francisco anyway. `flightSans(11)` drew at 17pt. So passing the requested
    /// number straight through shrinks all 219 legacy call sites by about a
    /// third, which is far too much: the frames around them are still sized for
    /// the old text, and small text in tall containers is what "weird" looks
    /// like.
    ///
    /// Second, that table was not monotonic. `flightSans(12)` resolved to 18pt
    /// while `flightSans(13)` resolved to 16.25pt, so asking for a larger size
    /// returned a smaller font. Reproducing the old sizes exactly would carry
    /// that inversion forward.
    ///
    /// So neither the requested size nor the old rendered size is the right
    /// answer. Each request is scaled by a fixed factor and snapped to
    /// `MCFont.ladder`: monotonic by construction, close to T3's density, and
    /// without the collapse. The factors are the ratio between the old ramps'
    /// intent and T3's steps — 1.2 for sans, 1.25 for mono, which is denser than
    /// the old inflation and slightly larger than a raw pass-through.
    ///
    /// New code should call `MCFont` directly. This shim exists to be deleted a
    /// file at a time.
    static func flightSans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        MCFont.sans(MCFont.snap(size * 1.2), weight)
    }

    static func flightMono(_ size: CGFloat, weight: Weight = .regular) -> Font {
        MCFont.mono(MCFont.snap(size * 1.25), weight)
    }

    /// The mobile ramp asked for honest sizes — it had no inflation table — so it
    /// only needs snapping onto the ladder.
    static func mobileDeckSans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        MCFont.sans(MCFont.snap(size), weight)
    }

    static func mobileDeckMono(_ size: CGFloat, weight: Weight = .regular) -> Font {
        MCFont.mono(MCFont.snap(size), weight)
    }
}
