/// Payload encoded in the pairing QR / deep link:
/// `remy://configure?url=<server>&token=<token>`
/// Older `missioncontrol://` links still pair.
export function parsePairingLink(raw: string): { url: string; token: string } | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "remy:" && parsed.protocol !== "missioncontrol:") ||
      parsed.hostname !== "configure"
    ) {
      return undefined;
    }
    const url = parsed.searchParams.get("url")?.trim();
    const token = parsed.searchParams.get("token")?.trim();
    if (!url || !token) return undefined;
    return { url, token };
  } catch {
    return undefined;
  }
}

export function hostLabel(url: string): string {
  if (url.startsWith("/")) return "this machine";
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
