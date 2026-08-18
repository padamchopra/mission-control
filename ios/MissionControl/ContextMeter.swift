import SwiftUI

/// How full a session's context window is. Claude Code compacts when it fills,
/// which drops history the agent was relying on — so knowing a session is about
/// to hit that is the difference between letting it run and wrapping it up
/// yourself. The numbers come from the transcript's own token accounting.
struct ContextMeter: View {
    let usage: ContextUsage

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: "gauge.with.dots.needle.33percent")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(usage.pressureColor)
            Text("Context")
                .font(.caption.weight(.semibold))
                .foregroundStyle(MCColor.foreground)
            Text(usage.summary)
                .font(.caption.monospaced())
                .foregroundStyle(MCColor.mutedForeground)
            Spacer(minLength: 6)
            if let note = usage.historyNote {
                Text(note)
                    .font(.caption2)
                    .foregroundStyle(MCColor.mutedForeground)
                    .lineLimit(1)
            }
            ContextBar(usage: usage, width: 64)
            Text("\(usage.percent)%")
                .font(.caption2.monospaced().weight(.semibold))
                .foregroundStyle(usage.pressureColor)
        }
        .help(usage.explanation)
    }
}

/// The bar on its own, for rows too tight for the labelled meter.
struct ContextBar: View {
    let usage: ContextUsage
    var width: CGFloat = 64

    var body: some View {
        ZStack(alignment: .leading) {
            Capsule().fill(MCColor.input).frame(width: width, height: 4)
            Capsule().fill(usage.pressureColor).frame(width: width * usage.fraction, height: 4)
        }
    }
}

/// The one-glance version for a fleet card, where a labelled meter would crowd
/// out the pane preview. Stays quiet until the session is actually under
/// pressure — a card that shouts 12% teaches you to ignore it.
struct ContextChip: View {
    let usage: ContextUsage

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "gauge.with.dots.needle.33percent")
            Text("ctx \(usage.percent)%")
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(usage.pressureColor)
    }
}

extension ContextUsage {
    var pressureColor: Color {
        if isCritical { return .red }
        if isTight { return .orange }
        return .secondary
    }

    /// "134k / 200k", or "134k / ~200k" when the window size is a guess.
    var summary: String {
        "\(Self.short(tokens)) / \(limitEstimated == true ? "~" : "")\(Self.short(limit))"
    }

    var historyNote: String? {
        guard let compactions, compactions > 0 else { return nil }
        let times = "compacted \(compactions)×"
        guard let dropped = droppedTokens, dropped > 0 else { return times }
        return "\(times) · \(Self.short(dropped)) dropped"
    }

    var explanation: String {
        var parts = ["\(tokens.formatted()) of \(limit.formatted()) context tokens in use."]
        if limitEstimated == true {
            parts.append("The window size is assumed — set contextLimit in the server's config.json if this session runs a larger one.")
        } else {
            parts.append("This session's window size is known from where it last auto-compacted.")
        }
        if let dropped = droppedTokens, dropped > 0 {
            parts.append("\(dropped.formatted()) tokens of history have been compacted away.")
        }
        return parts.joined(separator: " ")
    }

    static func short(_ tokens: Int) -> String {
        if tokens >= 1_000_000 {
            let millions = Double(tokens) / 1_000_000
            return millions >= 10 || millions == millions.rounded()
                ? "\(Int(millions.rounded()))M"
                : String(format: "%.1fM", millions)
        }
        if tokens >= 1_000 { return "\(Int((Double(tokens) / 1_000).rounded()))k" }
        return "\(tokens)"
    }
}
