/// Abbreviates a home directory to `~`. The server reports absolute paths and
/// the client has no `$HOME`, so the prefix is matched structurally rather than
/// compared against a known value.
export function displayPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

/// Markdown flattened into one line of prose, for places too small to render
/// it — a sidebar preview should read as a sentence rather than show its `##`
/// and backticks. Deliberately blunt: this is a glance, not a document.
export function plainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/(\*\*|__|~~)/g, "")
    // The preview arrives already clipped, so a backtick pair can be cut in
    // half. Whatever is left of one is noise.
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
