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

/// A pairing code as a person reads it: `418 902`. It is compared by eye
/// against the machine that asked, so the grouping does real work.
export function formatPairCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

export function hostLabel(url: string): string {
  if (url.startsWith("/")) return "this machine";
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
