import { Easing, interpolate, useCurrentFrame } from "remotion";

/// The sentence under the stage. One line, second person, present tense — the
/// same voice the app uses.
///
/// There is deliberately nowhere to put a route, a status code or a flag. This
/// is a promo, and a viewer who has to read `POST /pair/pending/:id/approve` has
/// stopped watching the thing it was meant to explain. Keep the mechanism in the
/// README and the repo.
export const Caption: React.FC<{
  step: string;
  line: string;
  from?: number;
}> = ({ step, line, from = 0 }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        bottom: 130,
        left: 112,
        right: 112,
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 22,
        opacity: interpolate(frame, [from, from + 9], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [from, from + 12], ["0px 20px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
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
  );
};
