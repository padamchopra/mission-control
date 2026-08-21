export const TINTS = {
  zinc: { fg: "#d4d4d8", well: "rgba(113,113,122,0.25)" },
  red: { fg: "#f87171", well: "rgba(239,68,68,0.2)" },
  orange: { fg: "#fb923c", well: "rgba(249,115,22,0.2)" },
  amber: { fg: "#fbbf24", well: "rgba(245,158,11,0.2)" },
  green: { fg: "#4ade80", well: "rgba(34,197,94,0.2)" },
  teal: { fg: "#2dd4bf", well: "rgba(20,184,166,0.2)" },
  blue: { fg: "#60a5fa", well: "rgba(59,130,246,0.2)" },
  violet: { fg: "#a78bfa", well: "rgba(139,92,246,0.2)" },
  pink: { fg: "#f472b6", well: "rgba(236,72,153,0.2)" },
} as const;

export type TintId = keyof typeof TINTS;

export const TINT_IDS = Object.keys(TINTS) as TintId[];

export function isTint(value: unknown): value is TintId {
  return typeof value === "string" && value in TINTS;
}

export function tintOf(id: TintId | string | null | undefined): (typeof TINTS)[TintId] {
  return TINTS[id && isTint(id) ? id : "zinc"];
}
