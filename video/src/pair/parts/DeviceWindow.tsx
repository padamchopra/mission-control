import { Laptop, Monitor } from "./Icons";

/// One device, as a window. Two of them side by side is the whole point of the
/// video: pairing is a conversation between two machines, not a setting on one.
///
/// The window is dark because Remy is. `.light` exists in `web/src/index.css`
/// but nothing adds the class, so a light mock would be a screenshot of an app
/// nobody is running. The label above the window sits on the page rather than
/// in the app, so it stays in the page's light palette.
///
/// One deliberate departure: the app's `--border` is white at 6%, which over
/// `#111111` is nearly invisible at 1.5px on a 1080p frame. The borders here run
/// a little hotter so the card still has an edge after H.264 gets to it.
export const DeviceWindow: React.FC<{
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
        border: "1.5px solid rgba(255, 255, 255, 0.1)",
        backgroundColor: "#111111",
        boxShadow:
          "0 34px 70px -26px rgba(10, 10, 10, 0.45), 0 3px 12px rgba(10, 10, 10, 0.25)",
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
          borderBottom: "1.5px solid rgba(255, 255, 255, 0.07)",
          backgroundColor: "#191919",
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
