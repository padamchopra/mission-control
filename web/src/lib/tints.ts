export const TINTS = {
  zinc: { swatch: "bg-zinc-100 ring-1 ring-inset ring-border", fg: "text-zinc-300", well: "bg-zinc-500/20" },
  red: { swatch: "bg-red-400", fg: "text-red-400", well: "bg-red-500/20" },
  orange: { swatch: "bg-orange-400", fg: "text-orange-400", well: "bg-orange-500/20" },
  amber: { swatch: "bg-amber-400", fg: "text-amber-400", well: "bg-amber-500/20" },
  green: { swatch: "bg-green-400", fg: "text-green-400", well: "bg-green-500/20" },
  teal: { swatch: "bg-teal-400", fg: "text-teal-400", well: "bg-teal-500/20" },
  blue: { swatch: "bg-blue-400", fg: "text-blue-400", well: "bg-blue-500/20" },
  violet: { swatch: "bg-violet-400", fg: "text-violet-400", well: "bg-violet-500/20" },
  pink: { swatch: "bg-pink-400", fg: "text-pink-400", well: "bg-pink-500/20" },
} as const;

export type TintId = keyof typeof TINTS;

export const TINT_IDS = Object.keys(TINTS) as TintId[];

export function isTint(value: unknown): value is TintId {
  return typeof value === "string" && value in TINTS;
}

export function tintOf(id: TintId | string | null | undefined): (typeof TINTS)[TintId] {
  return TINTS[id && isTint(id) ? id : "zinc"];
}
