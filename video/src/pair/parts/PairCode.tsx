/// The six digits, grouped `418 902` the way `formatPairCode` groups them —
/// the split is there so two people can compare them at a glance, which is the
/// entire security check, so the video shows it the same way the app does.
export const PairCode: React.FC<{
  code: string;
  size: number;
  color: string;
  style?: React.CSSProperties;
}> = ({ code, size, color, style }) => (
  <span
    style={{
      fontFamily: "JetBrains Mono, Menlo, monospace",
      fontSize: size,
      fontWeight: 500,
      letterSpacing: "0.2em",
      fontVariantNumeric: "tabular-nums",
      color,
      ...style,
    }}
  >
    {code}
  </span>
);
