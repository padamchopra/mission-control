import * as SecureStore from "expo-secure-store";

const KEY = "remy.pairings";
const LEGACY = "remy.pairing";

export interface Pairing {
  url: string;
  token: string;
  name?: string;
  deviceId?: string;
}

export function originOf(url: string): string {
  return url.replace(/\/+$/, "");
}

/// Stable id for a Mac this phone talks to directly, so a later /peers
/// deviceId does not rename the row mid-session.
export function directId(url: string): string {
  return `direct:${originOf(url)}`;
}

function parseOne(raw: unknown): Pairing | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = raw as Partial<Pairing>;
  if (typeof parsed.url !== "string" || typeof parsed.token !== "string") return undefined;
  if (!parsed.url.trim() || !parsed.token.trim()) return undefined;
  return {
    url: originOf(parsed.url.trim()),
    token: parsed.token.trim(),
    ...(typeof parsed.name === "string" && parsed.name.trim() ? { name: parsed.name.trim() } : {}),
    ...(typeof parsed.deviceId === "string" && parsed.deviceId.trim()
      ? { deviceId: parsed.deviceId.trim() }
      : {}),
  };
}

function serialize(pairing: Pairing): Pairing {
  return {
    url: originOf(pairing.url),
    token: pairing.token,
    ...(pairing.name ? { name: pairing.name } : {}),
    ...(pairing.deviceId ? { deviceId: pairing.deviceId } : {}),
  };
}

export function upsertPairing(list: Pairing[], next: Pairing): Pairing[] {
  const origin = originOf(next.url);
  return [...list.filter((entry) => originOf(entry.url) !== origin), serialize(next)];
}

export function removePairing(list: Pairing[], url: string): Pairing[] {
  const origin = originOf(url);
  return list.filter((entry) => originOf(entry.url) !== origin);
}

async function loadLegacy(): Promise<Pairing | undefined> {
  const raw = await SecureStore.getItemAsync(LEGACY);
  if (!raw) return undefined;
  try {
    return parseOne(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export async function loadPairings(): Promise<Pairing[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(parseOne).filter((entry): entry is Pairing => Boolean(entry));
      const one = parseOne(parsed);
      return one ? [one] : [];
    } catch {
      return [];
    }
  }
  const legacy = await loadLegacy();
  if (!legacy) return [];
  await savePairings([legacy]);
  await SecureStore.deleteItemAsync(LEGACY);
  return [legacy];
}

export async function savePairings(pairings: Pairing[]): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(pairings.map(serialize)));
}
