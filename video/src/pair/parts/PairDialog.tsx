import { Laptop } from "./Icons";
import { OutlineButton, PrimaryButton } from "./Buttons";
import { PairCode } from "./PairCode";

/// The prompt on the machine being asked, in the app's own words. The second
/// sentence of the description is the whole security model, so it is the line
/// the video is built around.
///
/// The surface is `--popover`, a step lighter than the card it sits over, which
/// is how the real dialog separates itself without a scrim doing all the work.
export const PairDialog: React.FC<{
  fromName: string;
  code: string;
  allowPressed?: number;
  allowBusy?: boolean;
  style?: React.CSSProperties;
}> = ({ fromName, code, allowPressed = 1, allowBusy = false, style }) => (
  <div
    style={{
      borderRadius: 22,
      border: "1.5px solid rgba(255, 255, 255, 0.1)",
      backgroundColor: "#191919",
      boxShadow: "0 28px 60px -18px rgba(10, 10, 10, 0.7)",
      padding: 26,
      display: "flex",
      flexDirection: "column",
      ...style,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 44 }}>
      <Laptop size={30} color="#818181" />
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 34,
          fontWeight: 600,
          color: "#f5f5f5",
          letterSpacing: "-0.01em",
        }}
      >
        {fromName} wants to pair
      </span>
    </div>

    <p
      style={{
        marginTop: 14,
        marginBottom: 0,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 25,
        lineHeight: 1.4,
        color: "#818181",
      }}
    >
      Allow it and the two machines share their boards, and can send each other
      notifications. Only allow it if this code matches the one on that machine.
    </p>

    <div
      style={{
        marginTop: 20,
        height: 110,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        border: "1.5px solid rgba(255, 255, 255, 0.08)",
        backgroundColor: "rgba(255, 255, 255, 0.03)",
      }}
    >
      <PairCode code={code} size={56} color="#f5f5f5" />
    </div>

    <div
      style={{
        marginTop: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 14,
      }}
    >
      <OutlineButton label="Deny" />
      <PrimaryButton
        label="Allow"
        pressed={allowPressed}
        style={{ opacity: allowBusy ? 0.65 : 1 }}
      />
    </div>
  </div>
);
