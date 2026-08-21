import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color } from "../theme";

/// A small subset of Markdown: fences, inline code, bold, italics, headings,
/// and paragraphs. Good enough for a thread on a phone.

export function Markdown({ text }: { text: string }) {
  const blocks = splitFences(text);
  return (
    <View style={styles.wrap}>
      {blocks.map((block, index) =>
        block.kind === "fence" ? (
          <Text key={index} style={styles.fence}>
            {block.text}
          </Text>
        ) : (
          <Text key={index} style={styles.paragraph}>
            {inline(block.text)}
          </Text>
        ),
      )}
    </View>
  );
}

function splitFences(text: string): { kind: "text" | "fence"; text: string }[] {
  const parts = text.split(/```[\w-]*\n?/);
  const out: { kind: "text" | "fence"; text: string }[] = [];
  parts.forEach((part, index) => {
    if (!part) return;
    out.push({ kind: index % 2 === 1 ? "fence" : "text", text: part.replace(/\n$/, "") });
  });
  return out.length ? out : [{ kind: "text", text }];
}

function inline(text: string): (string | ReactElement)[] {
  const nodes: (string | ReactElement)[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <Text key={key++} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <Text key={key++} style={styles.code}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={key++} style={styles.italic}>
          {token.slice(1, -1)}
        </Text>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  paragraph: { color: color.foreground, fontSize: 15, lineHeight: 22 },
  fence: {
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
    color: color.foreground,
    backgroundColor: color.muted,
    padding: 10,
    overflow: "hidden",
  },
  bold: { fontWeight: "600", color: color.foreground },
  italic: { fontStyle: "italic", color: color.foreground },
  code: {
    fontFamily: "Menlo",
    fontSize: 13,
    color: color.foreground,
    backgroundColor: color.muted,
  },
});
