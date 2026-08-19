import {
  House,
  Laptop,
  Monitor,
  Server,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { isTint, type TintId } from "./tints";

/// Icons a device can wear in the sidebar and in Settings. Kept small so the
/// picker is a glance, not a search.
export const DEVICE_ICONS = {
  laptop: Laptop,
  monitor: Monitor,
  smartphone: Smartphone,
  tablet: Tablet,
  server: Server,
  house: House,
} as const;

export type DeviceIconId = keyof typeof DEVICE_ICONS;

export const DEVICE_ICON_IDS = Object.keys(DEVICE_ICONS) as DeviceIconId[];

export function isDeviceIcon(value: unknown): value is DeviceIconId {
  return typeof value === "string" && value in DEVICE_ICONS;
}

export function deviceIcon(id: DeviceIconId | undefined): LucideIcon {
  return DEVICE_ICONS[id && isDeviceIcon(id) ? id : "laptop"];
}

/// A short device code, the way dense rows label a machine.
export function codeFor(name: string): string {
  const letters = name
    .split(/[\s-_]+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return (letters || name.slice(0, 2)).slice(0, 4);
}

const APPEARANCE_KEY = "remy.device-appearance";

export interface DeviceAppearance {
  name?: string;
  icon?: DeviceIconId;
  tint?: TintId;
}

export function loadAppearance(): Record<string, DeviceAppearance> {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
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
    return out;
  } catch {
    return {};
  }
}

export function saveAppearance(id: string, patch: DeviceAppearance): DeviceAppearance {
  const all = loadAppearance();
  const next = { ...all[id], ...patch };
  if (next.name !== undefined && !next.name.trim()) delete next.name;
  all[id] = next;
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(all));
  return next;
}
