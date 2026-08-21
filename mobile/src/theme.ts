/// Remy's dark tokens, converted from the web `oklch` values so the phone
/// and the desktop window agree on colour even though RN has no CSS.

export const color = {
  background: "#202020",
  foreground: "#f5f5f5",
  card: "#262626",
  muted: "rgba(255,255,255,0.04)",
  mutedForeground: "#a3a3a3",
  accent: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  input: "rgba(255,255,255,0.08)",
  primary: "#5b6cff",
  primaryForeground: "#ffffff",
  success: "#34d399",
  warning: "#fbbf24",
  destructive: "#f87171",
  info: "#60a5fa",
  claude: "#d97757",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  full: 999,
} as const;

export const type = {
  title: { fontSize: 22, fontWeight: "600" as const, color: color.foreground },
  heading: { fontSize: 17, fontWeight: "600" as const, color: color.foreground },
  body: { fontSize: 15, lineHeight: 21, color: color.foreground },
  callout: { fontSize: 14, lineHeight: 20, color: color.foreground },
  caption: { fontSize: 12, lineHeight: 16, color: color.mutedForeground },
  mono: { fontFamily: "Menlo", fontSize: 12, color: color.mutedForeground },
};
