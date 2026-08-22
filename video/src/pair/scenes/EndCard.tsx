import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Backdrop } from "../parts/Backdrop";

/// Where to go next, and the one claim worth repeating: none of this went
/// anywhere but your own machines.
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 112,
          paddingRight: 112,
        }}
      >
        <Interactive.Div
          name="Wordmark"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 30,
            opacity: interpolate(frame, [0, 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [0, 26], [0.92, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
          }}
        >
          <Img
            src={staticFile("remy-mark.png")}
            style={{ width: 132, height: 132, borderRadius: 34 }}
          />
          <span
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 96,
              fontWeight: 600,
              color: "#27272a",
              letterSpacing: "-0.03em",
            }}
          >
            Remy
          </span>
        </Interactive.Div>

        <Interactive.Div
          name="Tagline"
          style={{
            marginTop: 44,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 48,
            fontWeight: 400,
            color: "#71717b",
            textAlign: "center",
            lineHeight: 1.3,
            opacity: interpolate(frame, [12, 32], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [12, 36], ["0px 24px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          A remote for Claude Code, Codex, and Cursor
          <br />
          on the machines that already hold your repos.
        </Interactive.Div>

        <Interactive.Div
          name="Repo"
          style={{
            marginTop: 52,
            padding: "18px 34px",
            borderRadius: 999,
            border: "1.5px solid #e4e4e7",
            backgroundColor: "#ffffff",
            boxShadow: "0 12px 30px -14px rgba(39, 39, 42, 0.2)",
            fontFamily: "JetBrains Mono, Menlo, monospace",
            fontSize: 40,
            color: "#1b4ed8",
            opacity: interpolate(frame, [26, 46], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [26, 50], ["0px 24px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          github.com/padamchopra/remy
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
