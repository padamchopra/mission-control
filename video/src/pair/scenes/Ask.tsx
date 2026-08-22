import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts/Backdrop";
import { Caption } from "../parts/Caption";
import { Chrome } from "../parts/Chrome";
import { DeviceRow } from "../parts/DeviceRow";
import { PrimaryButton } from "../parts/Buttons";
import { MacWindow } from "../parts/MacWindow";
import { Pointer, RefreshCw } from "../parts/Icons";
import { SkeletonPane } from "../parts/SkeletonPane";
import { WaitingPanel } from "../parts/WaitingPanel";

/// Step two. The stage opens out to both machines, and Pair is pressed on this
/// one. All that crosses the wire is a request id — the other Mac is told
/// nothing else, and nothing is shared until somebody there says yes.
export const Ask: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />
      <Chrome step={2} />

      <MacWindow
        name="studio"
        note="this machine"
        device="laptop"
        style={{
          position: "absolute",
          top: 176,
          width: 780,
          left: interpolate(frame, [12, 44], [570, 104], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
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
            <WaitingPanel
              name="mac-mini"
              code="418 902"
              style={{
                height: interpolate(frame, [78, 100], [0, 192], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                marginBottom: interpolate(frame, [78, 100], [0, 14], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                overflow: "hidden",
                opacity: interpolate(frame, [82, 100], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                opacity: interpolate(frame, [78, 98], [1, 0.5], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            >
              <DeviceRow
                name="mac-mini"
                note="Remy is running here."
                device="monitor"
                action={
                  <PrimaryButton
                    label="Pair"
                    pressed={interpolate(frame, [72, 76, 84], [1, 0.93, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.bezier(0.33, 1, 0.68, 1),
                    })}
                  />
                }
              />
              <DeviceRow
                name="macbook-air"
                note="Remy is running here."
                device="laptop"
                action={<PrimaryButton label="Pair" />}
              />
              <DeviceRow
                name="attic-nas"
                note="Remy isn't answering here."
                device="drive"
                quiet
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
        style={{
          position: "absolute",
          top: 176,
          width: 780,
          left: interpolate(frame, [16, 52], [1960, 1036], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <SkeletonPane />
      </MacWindow>

      <div
        style={{
          position: "absolute",
          left: 753,
          top: 380,
          width: 88,
          height: 88,
          borderRadius: 44,
          border: "4px solid #1b4ed8",
          opacity: interpolate(frame, [74, 82, 100], [0, 0.55, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [74, 100], [0.3, 2.1], {
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
          left: interpolate(frame, [46, 72, 92, 116], [1250, 792, 792, 1990], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          top: interpolate(frame, [46, 72, 92, 116], [1160, 420, 420, 690], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <Pointer size={46} />
      </div>

      <Interactive.Div name="Ask caption">
        <Caption
          step="02"
          line="You press Pair. Nothing is shared yet."
          detail="POST /pair/request → an opaque id, and nothing else"
          from={14}
        />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
