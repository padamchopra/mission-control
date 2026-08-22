import { Check, Kanban } from "./Icons";

/// The sonner toast the app raises when an ask comes back approved.
export const Toast: React.FC<{ text: string; style?: React.CSSProperties }> = ({
  text,
  style,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "16px 22px",
      borderRadius: 16,
      border: "1.5px solid rgba(255, 255, 255, 0.1)",
      backgroundColor: "#191919",
      boxShadow: "0 16px 36px -12px rgba(10, 10, 10, 0.7)",
      ...style,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "#00bc7d",
      }}
    >
      <Check size={22} color="#0a0a0a" />
    </div>
    <span
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 28,
        fontWeight: 500,
        color: "#f5f5f5",
      }}
    >
      {text}
    </span>
  </div>
);

/// A ticket crossing the seam once the two boards are converging. It travels
/// over the light page rather than inside a window, so it is a light chip.
export const TicketChip: React.FC<{ label: string; style?: React.CSSProperties }> = ({
  label,
  style,
}) => (
  <div
    style={{
      position: "absolute",
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "8px 16px",
      borderRadius: 999,
      border: "1.5px solid #b6e8d3",
      backgroundColor: "#ffffff",
      boxShadow: "0 12px 28px -12px rgba(39, 39, 42, 0.26)",
      fontFamily: "JetBrains Mono, Menlo, monospace",
      fontSize: 22,
      fontWeight: 500,
      color: "#007a55",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    <Kanban size={22} color="#00bc7d" />
    {label}
  </div>
);
