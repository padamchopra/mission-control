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
      border: "1.5px solid rgba(255, 255, 255, 0.08)",
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      ...style,
    }}
  >
    <span
      style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 30, color: "#f5f5f5" }}
    >
      Waiting for {name}
    </span>
    <PairCode code={code} size={56} color="#f5f5f5" />
    <span
      style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 25, color: "#818181" }}
    >
      Allow it on {name} if it shows this code.
    </span>
  </div>
);

/// The same slot once somebody there pressed Allow. `--success` is one of the few
/// tokens that carries the same value on both schemes, so the green is untouched;
/// only the well behind it changes.
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
      border: "1.5px solid rgba(0, 188, 125, 0.32)",
      backgroundColor: "rgba(0, 188, 125, 0.1)",
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
      <Check size={34} color="#0a0a0a" />
    </div>
    <span
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 34,
        fontWeight: 500,
        color: "#00d492",
      }}
    >
      Paired {name}.
    </span>
  </div>
);
