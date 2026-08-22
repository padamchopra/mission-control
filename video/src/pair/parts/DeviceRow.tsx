import { HardDrive, Laptop, Monitor } from "./Icons";

/// A row in Settings → Devices → On your tailnet. The wording is the app's:
/// "Remy is running here." is what a probe that answered 401 earns; a machine
/// that Tailscale can see but Remy cannot answer on says so instead.
export const DeviceRow: React.FC<{
  name: string;
  note: string;
  device: "laptop" | "monitor" | "drive";
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
      border: "1.5px solid #e4e4e7",
      backgroundColor: quiet ? "#fafafa" : "#ffffff",
      ...style,
    }}
  >
    {device === "laptop" ? (
      <Laptop size={34} color="#71717b" />
    ) : device === "monitor" ? (
      <Monitor size={34} color="#71717b" />
    ) : (
      <HardDrive size={34} color="#71717b" />
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <span
        style={{
          fontFamily: "JetBrains Mono, Menlo, monospace",
          fontSize: 32,
          fontWeight: 500,
          color: quiet ? "#71717b" : "#27272a",
        }}
      >
        {name}
      </span>
      <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 26, color: "#71717b" }}>{note}</span>
    </div>

    {badge}
    {action}
  </div>
);
