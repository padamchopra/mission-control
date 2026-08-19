/// The message a failed API call should show. The transport rejects with the
/// server's response body, which is usually JSON — unwrap it so a card reads
/// "no such chat" rather than `{"error":"no such chat"}`.
export function apiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    // The transport already unwrapped some failures into a plain string.
  }
  return raw;
}
