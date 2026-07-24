import SwiftUI

/// A lightweight Markdown renderer for the conversation feed. Claude's output is
/// Markdown, so rendering it verbatim shows raw `**`, `##`, and `[text](url)`.
/// This covers the common subset — headings, bold/italic/inline code, links,
/// bullet and numbered lists, and fenced code blocks — parsing block structure
/// here and delegating inline styling to `AttributedString`.
struct MarkdownText: View {
    let text: String
    var color: Color = Color(white: 0.93)

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(Array(parse(text).enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private enum Block {
        case heading(Int, String)
        case bullet(String)
        case ordered(String, String)
        case code(String)
        case paragraph(String)
    }

    @ViewBuilder
    private func view(for block: Block) -> some View {
        switch block {
        case let .heading(level, content):
            Text(inline(content))
                .font(level <= 2 ? .callout.weight(.bold) : .subheadline.weight(.semibold))
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, alignment: .leading)
        case let .bullet(content):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").foregroundStyle(color.opacity(0.55))
                Text(inline(content)).foregroundStyle(color).frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.callout)
        case let .ordered(number, content):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(number + ".").foregroundStyle(color.opacity(0.55)).monospacedDigit()
                Text(inline(content)).foregroundStyle(color).frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.callout)
        case let .code(content):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(content)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(Color(white: 0.85))
                    .padding(10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(white: 0.07), in: RoundedRectangle(cornerRadius: 8))
        case let .paragraph(content):
            Text(inline(content))
                .font(.callout)
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func inline(_ string: String) -> AttributedString {
        (try? AttributedString(
            markdown: string,
            options: AttributedString.MarkdownParsingOptions(
                allowsExtendedAttributes: true,
                interpretedSyntax: .inlineOnlyPreservingWhitespace,
                failurePolicy: .returnPartiallyParsedIfPossible
            )
        )) ?? AttributedString(string)
    }

    private func parse(_ text: String) -> [Block] {
        var blocks: [Block] = []
        var paragraph: [String] = []
        var code: [String] = []
        var inCode = false

        func flushParagraph() {
            let joined = paragraph.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !joined.isEmpty { blocks.append(.paragraph(joined)) }
            paragraph.removeAll()
        }

        for line in text.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.hasPrefix("```") {
                if inCode {
                    blocks.append(.code(code.joined(separator: "\n")))
                    code.removeAll()
                    inCode = false
                } else {
                    flushParagraph()
                    inCode = true
                }
                continue
            }
            if inCode { code.append(line); continue }
            if trimmed.isEmpty { flushParagraph(); continue }

            if let heading = headingMatch(trimmed) {
                flushParagraph()
                blocks.append(.heading(heading.0, heading.1))
            } else if let bullet = bulletMatch(trimmed) {
                flushParagraph()
                blocks.append(.bullet(bullet))
            } else if let ordered = orderedMatch(trimmed) {
                flushParagraph()
                blocks.append(.ordered(ordered.0, ordered.1))
            } else {
                paragraph.append(line)
            }
        }
        if inCode, !code.isEmpty { blocks.append(.code(code.joined(separator: "\n"))) }
        flushParagraph()
        return blocks
    }

    private func headingMatch(_ line: String) -> (Int, String)? {
        var level = 0
        var idx = line.startIndex
        while idx < line.endIndex, line[idx] == "#", level < 6 {
            level += 1
            idx = line.index(after: idx)
        }
        guard level > 0, idx < line.endIndex, line[idx] == " " else { return nil }
        return (level, String(line[line.index(after: idx)...]))
    }

    private func bulletMatch(_ line: String) -> String? {
        for marker in ["- ", "* ", "+ "] where line.hasPrefix(marker) {
            return String(line.dropFirst(marker.count))
        }
        return nil
    }

    private func orderedMatch(_ line: String) -> (String, String)? {
        let chars = Array(line)
        var i = 0
        while i < chars.count, chars[i].isNumber { i += 1 }
        guard i > 0, i + 1 < chars.count, chars[i] == ".", chars[i + 1] == " " else { return nil }
        return (String(chars[0 ..< i]), String(chars[(i + 2)...]))
    }
}
