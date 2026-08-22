/// shadcn's button variants at video scale, in Remy's dark palette. `pressed` is
/// what a click looks like — the same small squeeze the real control has.

export const PrimaryButton: React.FC<{
  label: string;
  pressed?: number;
  style?: React.CSSProperties;
}> = ({ label, pressed = 1, style }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "14px 30px",
      borderRadius: 14,
      backgroundColor: "#346bf1",
      color: "#ffffff",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 30,
      fontWeight: 500,
      boxShadow: "0 2px 10px rgba(52, 107, 241, 0.4)",
      scale: pressed,
      ...style,
    }}
  >
    {label}
  </div>
);

export const OutlineButton: React.FC<{
  label: string;
  style?: React.CSSProperties;
}> = ({ label, style }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "14px 30px",
      borderRadius: 14,
      border: "1.5px solid rgba(255, 255, 255, 0.14)",
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      color: "#f5f5f5",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 30,
      fontWeight: 500,
      ...style,
    }}
  >
    {label}
  </div>
);
