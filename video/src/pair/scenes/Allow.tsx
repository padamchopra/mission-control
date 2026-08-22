import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts/Backdrop";
import { Caption } from "../parts/Caption";
import { Chrome } from "../parts/Chrome";
import { CodeHighlight } from "../parts/CodeHighlight";
import { DeviceRow } from "../parts/DeviceRow";
import { PrimaryButton } from "../parts/Buttons";
import { DeviceWindow } from "../parts/DeviceWindow";
import { PairDialog } from "../parts/PairDialog";
import { Pointer, RefreshCw } from "../parts/Icons";
import { SeamLink } from "../parts/SeamLink";
import { SkeletonPane } from "../parts/SkeletonPane";
import { WaitingPanel } from "../parts/WaitingPanel";
import { Sfx } from "../parts/Sfx";

/// Step three, and the only step that matters. Somebody standing at the other
/// device reads six digits, sees the same six digits here, and presses Allow.
/// Refuse to compare them and pairing simply does not happen.
export const Allow: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />
      <Chrome step={3} />

      <DeviceWindow
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
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 30,
                fontWeight: 500,
                color: "#f5f5f5",
              }}
            >
              On your tailnet
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <RefreshCw size={26} color="#818181" />
              <span
                style={{
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 28,
                  color: "#818181",
                }}
              >
                Look again
              </span>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <WaitingPanel name="workbench" code="418 902" style={{ marginBottom: 14 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: 0.5 }}>
              <DeviceRow
                name="workbench"
                note="Remy is running here."
                device="monitor"
                action={<PrimaryButton label="Pair" />}
              />
              <DeviceRow
                name="homelab"
                note="Remy is running here."
                device="server"
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
              backgroundImage: "linear-gradient(180deg, rgba(17, 17, 17, 0), #111111)",
            }}
          />
        </div>
      </DeviceWindow>

      <DeviceWindow
        name="workbench"
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
              backgroundColor: "rgba(10, 10, 10, 0.72)",
              opacity: interpolate(frame, [2, 14], [0, 1], {
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
              opacity: interpolate(frame, [4, 18], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              scale: interpolate(frame, [4, 22], [0.955, 1], {
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
              allowPressed={interpolate(frame, [70, 74, 80], [1, 0.93, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.33, 1, 0.68, 1),
              })}
              allowBusy={frame > 78}
            />
          </div>
        </div>
      </DeviceWindow>

      <SeamLink
        tone="asking"
        draw={interpolate(frame, [16, 40], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        })}
        label={interpolate(frame, [32, 44], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        badge={interpolate(frame, [38, 52], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.34, 1.5, 0.64, 1),
        })}
      />

      <CodeHighlight
        left={309}
        top={433}
        opacity={interpolate(frame, [30, 40], [0, 0.85], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        scale={interpolate(frame, [30, 44], [1.08, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          output: "perceptual-scale",
        })}
      />

      <CodeHighlight
        left={1241}
        top={525}
        opacity={interpolate(frame, [30, 40], [0, 0.85], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        scale={interpolate(frame, [30, 44], [1.08, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          output: "perceptual-scale",
        })}
      />

      <div
        style={{
          position: "absolute",
          left: 1656,
          top: 622,
          width: 88,
          height: 88,
          borderRadius: 44,
          border: "4px solid #60a5fa",
          opacity: interpolate(frame, [72, 78, 92], [0, 0.55, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [72, 92], [0.3, 2.1], {
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
          left: interpolate(frame, [44, 68], [1990, 1747], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          top: interpolate(frame, [44, 68], [880, 644], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <Pointer size={46} />
      </div>

      <Sfx sound="click" at={70} />

      <Interactive.Div name="Allow caption">
        <Caption step="03" line="Somebody there compares the code and allows it." from={10} />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
