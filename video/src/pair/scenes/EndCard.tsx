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
import { GitHub } from "../parts/Icons";

/// Two lines: who this is, and where it lives. Nothing else.
///
/// There was a tagline here explaining what Remy is. Fifteen seconds of the app
/// doing the thing has already said it, and an end card that has to be read is
/// an end card nobody reads.
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
            gap: 32,
            opacity: interpolate(frame, [0, 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [0, 20], [0.92, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
          }}
        >
          <Img
            src={staticFile("remy-mark.png")}
            style={{ width: 140, height: 140, borderRadius: 36 }}
          />
          <span
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 104,
              fontWeight: 600,
              color: "#27272a",
              letterSpacing: "-0.03em",
            }}
          >
            Remy
          </span>
        </Interactive.Div>

        <Interactive.Div
          name="Repo"
          style={{
            marginTop: 64,
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: interpolate(frame, [10, 24], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [10, 28], ["0px 20px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <GitHub size={64} color="#27272a" />
          <span
            style={{
              fontFamily: "JetBrains Mono, Menlo, monospace",
              fontSize: 54,
              fontWeight: 500,
              color: "#27272a",
            }}
          >
            padamchopra/remy
          </span>
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
