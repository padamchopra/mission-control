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

export function formatPairCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

export function hostLabel(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function threadIdFromLink(raw: string): string | undefined {
  const match = /^(?:remy|missioncontrol):\/\/chat\/(.+)$/.exec(raw.trim());
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).trim() || undefined;
  } catch {
    return match[1].trim() || undefined;
  }
}
