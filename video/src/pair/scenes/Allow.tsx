import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts/Backdrop";
import { Caption } from "../parts/Caption";
import { Chrome } from "../parts/Chrome";
import { DeviceRow } from "../parts/DeviceRow";
import { PrimaryButton } from "../parts/Buttons";
import { MacWindow } from "../parts/MacWindow";
import { PairDialog } from "../parts/PairDialog";
import { Pointer, RefreshCw } from "../parts/Icons";
import { SeamLink } from "../parts/SeamLink";
import { SkeletonPane } from "../parts/SkeletonPane";
import { WaitingPanel } from "../parts/WaitingPanel";

/// Step three, and the only step that matters. Somebody standing at the other
/// Mac reads six digits, sees the same six digits here, and presses Allow.
/// Refuse to compare them and pairing simply does not happen.
export const Allow: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />
      <Chrome step={3} />

      <MacWindow
        name="studio"
        note="this machine"
        device="laptop"
        style={{ position: "absolute", top: 176, left: 104, width: 780 }}
      >
        <div style={{ position: "relative", height: 440, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 44,
            }}
          >
            <span
              style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 30, fontWeight: 500, color: "#27272a" }}
            >
              On your tailnet
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <RefreshCw size={26} color="#71717b" />
              <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 28, color: "#71717b" }}>
                Look again
              </span>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <WaitingPanel name="mac-mini" code="418 902" style={{ marginBottom: 14 }} />
            <div
              style={{ display: "flex", flexDirection: "column", gap: 12, opacity: 0.5 }}
            >
              <DeviceRow
                name="mac-mini"
                note="Remy is running here."
                device="monitor"
                action={<PrimaryButton label="Pair" />}
              />
              <DeviceRow
                name="macbook-air"
                note="Remy is running here."
                device="laptop"
                action={<PrimaryButton label="Pair" />}
              />
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 72,
              backgroundImage: "linear-gradient(180deg, rgba(255, 255, 255, 0), #ffffff)",
            }}
          />
        </div>
      </MacWindow>

      <MacWindow
        name="mac-mini"
        note="on your tailnet"
        device="monitor"
        style={{ position: "absolute", top: 176, left: 1036, width: 780 }}
      >
        <div style={{ position: "relative", height: 440 }}>
          <SkeletonPane />

          <div
            style={{
              position: "absolute",
              inset: -26,
              backgroundColor: "rgba(252, 252, 252, 0.74)",
              opacity: interpolate(frame, [4, 22], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          />

          <div
            style={{
              position: "absolute",
              inset: -26,
              padding: 18,
              opacity: interpolate(frame, [6, 26], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              scale: interpolate(frame, [6, 30], [0.955, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                output: "perceptual-scale",
              }),
            }}
          >
            <PairDialog
              fromName="studio"
              code="418 902"
              allowPressed={interpolate(frame, [102, 106, 114], [1, 0.93, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.33, 1, 0.68, 1),
              })}
              allowBusy={frame > 112}
            />
          </div>
        </div>
      </MacWindow>

      <SeamLink
        tone="asking"
        draw={interpolate(frame, [30, 60], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        })}
        label={interpolate(frame, [52, 68], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        badge={interpolate(frame, [60, 78], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.34, 1.5, 0.64, 1),
        })}
      />

      <div
        style={{
          position: "absolute",
          left: 309,
          top: 434,
          width: 370,
          height: 72,
          borderRadius: 18,
          border: "3px solid #1b4ed8",
          opacity: interpolate(frame, [46, 58], [0, 0.75], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [46, 62], [1.08, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 1241,
          top: 526,
          width: 370,
          height: 72,
          borderRadius: 18,
          border: "3px solid #1b4ed8",
          opacity: interpolate(frame, [46, 58], [0, 0.75], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [46, 62], [1.08, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 1656,
          top: 622,
          width: 88,
          height: 88,
          borderRadius: 44,
          border: "4px solid #1b4ed8",
          opacity: interpolate(frame, [104, 112, 130], [0, 0.55, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [104, 130], [0.3, 2.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />

      <div
        style={{
          position: "absolute",
          left: interpolate(frame, [70, 100], [1990, 1747], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          top: interpolate(frame, [70, 100], [880, 644], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <Pointer size={46} />
      </div>

      <Interactive.Div name="Allow caption">
        <Caption
          step="03"
          line="Somebody there compares the code and allows it."
          detail="POST /pair/pending/:id/approve — a person, not a token"
          from={16}
        />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
