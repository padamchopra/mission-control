import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

/// The strip along the top of every demo scene: who this is, and where you are
/// in the three steps. Small on purpose — the stage below it is the subject.
export const Chrome: React.FC<{ step: 1 | 2 | 3 | 4 }> = ({ step }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        top: 74,
        left: 112,
        right: 112,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        opacity: interpolate(frame, [0, 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Img
          src={staticFile("remy-mark.png")}
          style={{ width: 52, height: 52, borderRadius: 14 }}
        />
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 34,
            fontWeight: 600,
            color: "#27272a",
            letterSpacing: "-0.01em",
          }}
        >
          Remy
        </span>
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 30,
            fontWeight: 400,
            color: "#71717b",
          }}
        >
          Settings › Devices
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {[1, 2, 3].map((dot) => (
          <div
            key={dot}
            style={{
              width: dot <= step ? 34 : 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: dot <= step ? "#1b4ed8" : "#e4e4e7",
            }}
          />
        ))}
      </div>
    </div>
  );
};
