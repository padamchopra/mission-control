import { Check } from "./Icons";
import { PairCode } from "./PairCode";

/// What the asking machine shows while it waits, word for word from Settings →
/// Devices: the code, and the one instruction that matters.
export const WaitingPanel: React.FC<{
  name: string;
  code: string;
  style?: React.CSSProperties;
}> = ({ name, code, style }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      height: 192,
      borderRadius: 18,
      border: "1.5px solid #e4e4e7",
      backgroundColor: "#fafafa",
      ...style,
    }}
  >
    <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 30, color: "#27272a" }}>
      Waiting for {name}
    </span>
    <PairCode code={code} size={56} color="#27272a" />
    <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 25, color: "#71717b" }}>
      Allow it on {name} if it shows this code.
    </span>
  </div>
);

/// The same slot once somebody there pressed Allow.
export const PairedPanel: React.FC<{
  name: string;
  style?: React.CSSProperties;
}> = ({ name, style }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      height: 192,
      borderRadius: 18,
      border: "1.5px solid #b6e8d3",
      backgroundColor: "#f0fbf6",
      ...style,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: "#00bc7d",
      }}
    >
      <Check size={34} color="#ffffff" />
    </div>
    <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 34, fontWeight: 500, color: "#007a55" }}>
      Paired {name}.
    </span>
  </div>
);
