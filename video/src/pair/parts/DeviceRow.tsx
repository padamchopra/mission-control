import { HardDrive, Laptop, Monitor, Server } from "./Icons";

/// A row in Settings → Devices → On your tailnet. The wording is the app's:
/// "Remy is running here." is what a probe that answered 401 earns; a machine
/// that Tailscale can see but Remy cannot answer on says so instead.
///
/// The device classes are deliberately mixed. Remy's `DEVICE_ICONS` carries a
/// phone, a tablet, a server and a cloud, and a list of three laptops would make
/// the video look narrower than the product.
export const DeviceRow: React.FC<{
  name: string;
  note: string;
  device: "laptop" | "monitor" | "server" | "drive";
  quiet?: boolean;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ name, note, device, quiet = false, action, badge, style }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 20,
      height: 118,
      padding: "16px 24px",
      borderRadius: 18,
      border: "1.5px solid rgba(255, 255, 255, 0.07)",
      backgroundColor: quiet ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.04)",
      ...style,
    }}
  >
    {device === "laptop" ? (
      <Laptop size={34} color="#818181" />
    ) : device === "monitor" ? (
      <Monitor size={34} color="#818181" />
    ) : device === "server" ? (
      <Server size={34} color="#818181" />
    ) : (
      <HardDrive size={34} color="#818181" />
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <span
        style={{
          fontFamily: "JetBrains Mono, Menlo, monospace",
          fontSize: 32,
          fontWeight: 500,
          color: quiet ? "#818181" : "#f5f5f5",
        }}
      >
        {name}
      </span>
      <span
        style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 26, color: "#818181" }}
      >
        {note}
      </span>
    </div>

    {badge}
    {action}
  </div>
);
