import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

/// The light ground every scene sits on: Remy's `--background` in the light
/// scheme, a dot grid faint enough to read as paper texture, and one slow
/// primary-tinted bloom so a 20-second video is never a flat white rectangle.
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#fcfcfc" }}>
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(#27272a 1px, transparent 1px)",
          backgroundSize: "34px 34px",
          opacity: 0.045,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(1100px 700px at 22% 8%, rgba(27, 78, 216, 0.13), transparent 70%)",
          translate: interpolate(frame, [0, 600], ["-40px 0px", "80px 30px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(900px 620px at 84% 96%, rgba(0, 188, 125, 0.11), transparent 70%)",
          translate: interpolate(frame, [0, 600], ["50px 20px", "-50px -20px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      />
    </AbsoluteFill>
  );
};
