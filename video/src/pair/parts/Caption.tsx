import { Easing, interpolate, useCurrentFrame } from "remotion";

/// The sentence under the stage. One line, second person, present tense — the
/// same voice the app itself uses — with an optional mono line for the detail a
/// developer watching would want to see.
export const Caption: React.FC<{
  step: string;
  line: string;
  detail?: string;
  from?: number;
}> = ({ step, line, detail, from = 0 }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        bottom: 96,
        left: 112,
        right: 112,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        opacity: interpolate(frame, [from, from + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [from, from + 16], ["0px 22px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
        <span
          style={{
            fontFamily: "JetBrains Mono, Menlo, monospace",
            fontSize: 34,
            fontWeight: 500,
            color: "#1b4ed8",
          }}
        >
          {step}
        </span>
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 54,
            fontWeight: 600,
            color: "#27272a",
            letterSpacing: "-0.02em",
          }}
        >
          {line}
        </span>
      </div>

      {detail ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 22px",
            borderRadius: 999,
            border: "1.5px solid #e4e4e7",
            backgroundColor: "#ffffff",
            fontFamily: "JetBrains Mono, Menlo, monospace",
            fontSize: 28,
            fontWeight: 400,
            color: "#71717b",
            opacity: interpolate(frame, [from + 14, from + 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
};
