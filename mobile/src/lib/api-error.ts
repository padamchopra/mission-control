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

/// Turns a failed HTTP body into a sentence a person can act on. Tailscale
/// Serve answers empty 502s and HTML interstitials rather than Remy's JSON.
export function httpError(status: number, text: string): Error {
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return new Error(parsed.error);
  } catch {
    // Not JSON — Tailscale pages, empty 502s, raw text.
  }
  if (/not on (your |the )?tailnet|connect to your tailnet/i.test(text)) {
    return new Error("This iPhone is not on your tailnet. Open Tailscale and try again.");
  }
  if (status === 502 || status === 503 || status === 504) {
    return new Error("That Mac isn't running Remy.");
  }
  const trimmed = text.trim();
  if (trimmed && trimmed.length < 200 && !trimmed.startsWith("<")) return new Error(trimmed);
  return new Error(`Couldn't reach that Mac (${status}).`);
}

export function chatIdFrom(error: unknown): string | undefined {
  if (error && typeof error === "object" && "chatId" in error) {
    const id = (error as { chatId?: unknown }).chatId;
    if (typeof id === "string" && id) return id;
  }
  return undefined;
}
