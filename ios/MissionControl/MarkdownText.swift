import SwiftUI

/// A lightweight Markdown renderer for the conversation feed. Claude's output is
/// Markdown, so rendering it verbatim shows raw `**`, `##`, and `[text](url)`.
/// This covers the common subset — headings, bold/italic/inline code, links,
/// bullet and numbered lists, fenced code blocks, and GitHub-style tables —
/// parsing block structure here and delegating inline styling to
/// `AttributedString`.
struct MarkdownText: View {
    let text: String
    var color: Color = MCColor.foreground

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
        case task(Bool, String)
        case ordered(String, String)
        case code(String)
        case table([String], [[String]], [TableAlignment])
        case paragraph(String)
    }

    private enum TableAlignment {
        case leading
        case center
        case trailing

        var frameAlignment: Alignment {
            switch self {
            case .leading: return .leading
            case .center: return .center
            case .trailing: return .trailing
            }
        }
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
        case let .task(checked, content):
            HStack(alignment: .top, spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: MCRadius.xs, style: .continuous)
                        .fill(checked ? color.opacity(0.14) : Color.clear)
                    RoundedRectangle(cornerRadius: MCRadius.xs, style: .continuous)
                        .stroke(checked ? color.opacity(0.8) : color.opacity(0.42), lineWidth: 1)
                    if checked {
                        Image(systemName: "checkmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(color)
                    }
                }
                .frame(width: 14, height: 14)
                .padding(.top, 2)

                Text(inline(content))
                    .foregroundStyle(color)
                    .frame(maxWidth: .infinity, alignment: .leading)
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
                    .foregroundStyle(MCColor.foreground)
                    .padding(10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MCColor.card, in: RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
        case let .table(headers, rows, alignments):
            table(headers: headers, rows: rows, alignments: alignments)
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

    private func table(headers: [String], rows: [[String]], alignments: [TableAlignment]) -> some View {
        let widths = headers.indices.map { tableColumnWidth($0, headers: headers, rows: rows) }
        return ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                tableRow(headers, widths: widths, alignments: alignments, header: true)
                Divider().overlay(Color.white.opacity(0.18))
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    tableRow(row, widths: widths, alignments: alignments, header: false)
                        .background(index.isMultiple(of: 2) ? Color.clear : Color.white.opacity(0.025))
                    if index < rows.count - 1 {
                        Divider().overlay(Color.white.opacity(0.1))
                    }
                }
            }
            .background(MCColor.card)
            .clipShape(RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: MCRadius.md, style: .continuous).stroke(Color.white.opacity(0.16)))
            .fixedSize(horizontal: true, vertical: true)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tableRow(
        _ cells: [String],
        widths: [CGFloat],
        alignments: [TableAlignment],
        header: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(widths.indices, id: \.self) { index in
                Text(inline(index < cells.count ? cells[index] : ""))
                    .font(header ? .caption.weight(.semibold) : .caption)
                    .foregroundStyle(header ? color : color.opacity(0.88))
                    .multilineTextAlignment(textAlignment(alignments[index]))
                    .frame(width: widths[index], alignment: alignments[index].frameAlignment)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 7)
                    .overlay(alignment: .trailing) {
                        if index < widths.count - 1 {
                            Rectangle().fill(Color.white.opacity(0.1)).frame(width: 0.5)
                        }
                    }
            }
        }
        .background(header ? Color.white.opacity(0.07) : Color.clear)
    }

    private func tableColumnWidth(_ index: Int, headers: [String], rows: [[String]]) -> CGFloat {
        let values = [headers[index]] + rows.map { index < $0.count ? $0[index] : "" }
        let longest = values.map(\.count).max() ?? 0
        return min(max(CGFloat(longest) * 7 + 20, 96), 240)
    }

    private func textAlignment(_ alignment: TableAlignment) -> TextAlignment {
        switch alignment {
        case .leading: return .leading
        case .center: return .center
        case .trailing: return .trailing
        }
    }

    private func parse(_ text: String) -> [Block] {
        var blocks: [Block] = []
        var paragraph: [String] = []
        var code: [String] = []
        var inCode = false
        let lines = text.components(separatedBy: "\n")
        var index = 0

        func flushParagraph() {
            let joined = paragraph.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !joined.isEmpty { blocks.append(.paragraph(joined)) }
            paragraph.removeAll()
        }

        while index < lines.count {
            let line = lines[index]
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
                index += 1
                continue
            }
            if inCode {
                code.append(line)
                index += 1
                continue
            }
            if trimmed.isEmpty {
                flushParagraph()
                index += 1
                continue
            }

            if index + 1 < lines.count,
               let headers = tableCells(line),
               let alignments = tableDelimiter(lines[index + 1], columns: headers.count) {
                flushParagraph()
                var rows: [[String]] = []
                index += 2
                while index < lines.count, let row = tableCells(lines[index]), !row.isEmpty {
                    rows.append(normalizedTableRow(row, columns: headers.count))
                    index += 1
                }
                blocks.append(.table(headers, rows, alignments))
                continue
            }

            if let heading = headingMatch(trimmed) {
                flushParagraph()
                blocks.append(.heading(heading.0, heading.1))
            } else if let bullet = bulletMatch(trimmed) {
                flushParagraph()
                if let task = taskMatch(bullet) {
                    blocks.append(.task(task.checked, task.content))
                } else {
                    blocks.append(.bullet(bullet))
                }
            } else if let ordered = orderedMatch(trimmed) {
                flushParagraph()
                blocks.append(.ordered(ordered.0, ordered.1))
            } else {
                paragraph.append(line)
            }
            index += 1
        }
        if inCode, !code.isEmpty { blocks.append(.code(code.joined(separator: "\n"))) }
        flushParagraph()
        return blocks
    }

    private func tableCells(_ line: String) -> [String]? {
        var source = line.trimmingCharacters(in: .whitespaces)
        guard source.contains("|") else { return nil }
        if source.hasPrefix("|") { source.removeFirst() }
        if source.hasSuffix("|") { source.removeLast() }

        var cells: [String] = []
        var cell = ""
        var escaped = false
        var inCodeSpan = false
        for character in source {
            if escaped {
                if character == "|" || character == "\\" {
                    cell.append(character)
                } else {
                    cell.append("\\")
                    cell.append(character)
                }
                escaped = false
            } else if character == "\\" {
                escaped = true
            } else if character == "`" {
                inCodeSpan.toggle()
                cell.append(character)
            } else if character == "|", !inCodeSpan {
                cells.append(cell.trimmingCharacters(in: .whitespaces))
                cell = ""
            } else {
                cell.append(character)
            }
        }
        if escaped { cell.append("\\") }
        cells.append(cell.trimmingCharacters(in: .whitespaces))
        return cells.count >= 2 ? cells : nil
    }

    private func tableDelimiter(_ line: String, columns: Int) -> [TableAlignment]? {
        guard let cells = tableCells(line), cells.count == columns else { return nil }
        var alignments: [TableAlignment] = []
        for cell in cells {
            var marker = cell.trimmingCharacters(in: .whitespaces)
            let leadingColon = marker.hasPrefix(":")
            let trailingColon = marker.hasSuffix(":")
            if leadingColon { marker.removeFirst() }
            if trailingColon, !marker.isEmpty { marker.removeLast() }
            guard marker.count >= 3, marker.allSatisfy({ $0 == "-" }) else { return nil }
            alignments.append(leadingColon && trailingColon ? .center : trailingColon ? .trailing : .leading)
        }
        return alignments
    }

    private func normalizedTableRow(_ row: [String], columns: Int) -> [String] {
        if row.count >= columns { return Array(row.prefix(columns)) }
        return row + Array(repeating: "", count: columns - row.count)
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

    private func taskMatch(_ content: String) -> (checked: Bool, content: String)? {
        let characters = Array(content)
        guard characters.count >= 3,
              characters[0] == "[",
              characters[2] == "]",
              characters[1] == " " || characters[1] == "x" || characters[1] == "X",
              characters.count == 3 || characters[3].isWhitespace else { return nil }
        let label = String(characters.dropFirst(3)).trimmingCharacters(in: .whitespaces)
        return (characters[1] != " ", label)
    }

    private func orderedMatch(_ line: String) -> (String, String)? {
        let chars = Array(line)
        var i = 0
        while i < chars.count, chars[i].isNumber { i += 1 }
        guard i > 0, i + 1 < chars.count, chars[i] == ".", chars[i + 1] == " " else { return nil }
        return (String(chars[0 ..< i]), String(chars[(i + 2)...]))
    }
}
