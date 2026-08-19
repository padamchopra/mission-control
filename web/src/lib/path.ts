/// Abbreviates a home directory to `~`. The server reports absolute paths and
/// the client has no `$HOME`, so the prefix is matched structurally rather than
/// compared against a known value.
export function displayPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}
