import * as SecureStore from "expo-secure-store";
import { Cloud, House, Laptop, Monitor, Server, Smartphone, Tablet, type LucideIcon } from "lucide-react-native";
import { isTint, type TintId } from "./tints";

const APPEARANCE_KEY = "remy.device-appearance";

export const DEVICE_ICONS = {
  laptop: Laptop,
  monitor: Monitor,
  smartphone: Smartphone,
  tablet: Tablet,
  server: Server,
  house: House,
  cloud: Cloud,
} as const;

export type DeviceIconId = keyof typeof DEVICE_ICONS;

export const DEVICE_ICON_IDS = Object.keys(DEVICE_ICONS) as DeviceIconId[];

export function isDeviceIcon(value: unknown): value is DeviceIconId {
  return typeof value === "string" && value in DEVICE_ICONS;
}

export function deviceIcon(id: DeviceIconId | undefined): LucideIcon {
  return DEVICE_ICONS[id && isDeviceIcon(id) ? id : "laptop"];
}

export function codeFor(name: string): string {
  const letters = name
    .split(/[\s-_]+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return (letters || name.slice(0, 2)).slice(0, 4);
}

export interface DeviceAppearance {
  name?: string;
  icon?: DeviceIconId;
  tint?: TintId;
}

let cache: Record<string, DeviceAppearance> = {};

export function appearanceOf(id: string): DeviceAppearance {
  return cache[id] ?? {};
}

export async function hydrateAppearance(): Promise<void> {
  const raw = await SecureStore.getItemAsync(APPEARANCE_KEY);
  if (!raw) {
    cache = {};
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      cache = {};
      return;
    }
    const out: Record<string, DeviceAppearance> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      out[id] = {
        ...(typeof record.name === "string" && record.name.trim() ? { name: record.name.trim() } : {}),
        ...(isDeviceIcon(record.icon) ? { icon: record.icon } : {}),
        ...(isTint(record.tint) ? { tint: record.tint } : {}),
      };
    }
    cache = out;
  } catch {
    cache = {};
  }
}

export async function saveAppearance(id: string, patch: DeviceAppearance): Promise<DeviceAppearance> {
  const next = { ...cache[id], ...patch };
  if (next.name !== undefined && !next.name.trim()) delete next.name;
  cache = { ...cache, [id]: next };
  await SecureStore.setItemAsync(APPEARANCE_KEY, JSON.stringify(cache));
  return next;
}
