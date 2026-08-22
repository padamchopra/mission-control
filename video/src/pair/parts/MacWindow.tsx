import { Laptop, Monitor } from "./Icons";

/// One machine, as a window. Two of them side by side is the whole point of the
/// video: pairing is a conversation between two Macs, not a setting on one.
export const MacWindow: React.FC<{
  name: string;
  note: string;
  device: "laptop" | "monitor";
  linked?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ name, note, device, linked = false, children, style }) => (
  <div style={style}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
        paddingLeft: 6,
      }}
    >
      {device === "laptop" ? (
        <Laptop size={30} color="#71717b" />
      ) : (
        <Monitor size={30} color="#71717b" />
      )}
      <span
        style={{
          fontFamily: "JetBrains Mono, Menlo, monospace",
          fontSize: 30,
          fontWeight: 500,
          color: "#27272a",
        }}
      >
        {name}
      </span>
      {linked ? (
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: "#00bc7d",
            marginLeft: 4,
          }}
        />
      ) : null}
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 28,
          color: linked ? "#007a55" : "#71717b",
        }}
      >
        {note}
      </span>
    </div>

    <div
      style={{
        borderRadius: 26,
        border: "1.5px solid #e4e4e7",
        backgroundColor: "#ffffff",
        boxShadow:
          "0 34px 70px -28px rgba(39, 39, 42, 0.22), 0 3px 10px rgba(39, 39, 42, 0.05)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 56,
          paddingLeft: 22,
          borderBottom: "1.5px solid #e4e4e7",
          backgroundColor: "#fafafa",
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#ff5f57" }} />
        <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#febc2e" }} />
        <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#28c840" }} />
      </div>

      <div style={{ padding: 26 }}>{children}</div>
    </div>
  </div>
);
