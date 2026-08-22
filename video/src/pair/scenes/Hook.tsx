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

/// The claim, in the repo's own words: two machines pair by asking, not by
/// carrying a token. Everything after this is the proof.
export const Hook: React.FC = () => {
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
            gap: 24,
            marginBottom: 62,
            opacity: interpolate(frame, [0, 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [0, 20], [0.9, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
          }}
        >
          <Img
            src={staticFile("remy-mark.png")}
            style={{ width: 84, height: 84, borderRadius: 22 }}
          />
          <span
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 52,
              fontWeight: 600,
              color: "#27272a",
              letterSpacing: "-0.02em",
            }}
          >
            Remy
          </span>
        </Interactive.Div>

        <Interactive.Div
          name="Headline first line"
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 116,
            fontWeight: 600,
            color: "#27272a",
            letterSpacing: "-0.035em",
            lineHeight: 1.06,
            opacity: interpolate(frame, [6, 26], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [6, 30], ["0px 34px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Two Macs pair by asking,
        </Interactive.Div>

        <Interactive.Div
          name="Headline second line"
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 116,
            fontWeight: 600,
            color: "#1b4ed8",
            letterSpacing: "-0.035em",
            lineHeight: 1.06,
            opacity: interpolate(frame, [14, 34], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [14, 38], ["0px 34px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          not by carrying a token.
        </Interactive.Div>

        <Interactive.Div
          name="Subtitle"
          style={{
            marginTop: 46,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 46,
            fontWeight: 400,
            color: "#71717b",
            opacity: interpolate(frame, [26, 46], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [26, 50], ["0px 26px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Your tailnet finds them. Six digits confirm it.
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
