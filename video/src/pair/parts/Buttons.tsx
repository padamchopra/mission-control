/// shadcn's three button variants at video scale. `pressed` is what a click
/// looks like — the same small squeeze the real control has.

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
      backgroundColor: "#1b4ed8",
      color: "#ffffff",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 30,
      fontWeight: 500,
      boxShadow: "0 2px 8px rgba(27, 78, 216, 0.28)",
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
      border: "1.5px solid #d4d4d8",
      backgroundColor: "#ffffff",
      color: "#27272a",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 30,
      fontWeight: 500,
      ...style,
    }}
  >
    {label}
  </div>
);
