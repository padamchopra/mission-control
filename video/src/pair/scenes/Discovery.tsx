import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts/Backdrop";
import { Caption } from "../parts/Caption";
import { Chrome } from "../parts/Chrome";
import { DeviceRow } from "../parts/DeviceRow";
import { PrimaryButton } from "../parts/Buttons";
import { DeviceWindow } from "../parts/DeviceWindow";
import { RefreshCw } from "../parts/Icons";
import { Sfx } from "../parts/Sfx";

/// Step one. Nothing has been asked of anybody yet — this is only Tailscale's
/// own list of your devices, with the ones answering Remy marked.
export const Discovery: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />
      <Chrome step={1} />

      <DeviceWindow
        name="studio"
        note="this machine"
        device="laptop"
        style={{
          position: "absolute",
          top: 176,
          left: 570,
          width: 780,
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 16], [0.965, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
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
              <div
                style={{
                  display: "flex",
                  rotate: interpolate(frame, [6, 52], ["0deg", "720deg"], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                  }),
                }}
              >
                <RefreshCw size={26} color="#818181" />
              </div>
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

          <div
            style={{
              position: "relative",
              marginTop: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <DeviceRow
              name="workbench"
              note="Remy is running here."
              device="monitor"
              action={<PrimaryButton label="Pair" />}
              style={{
                height: interpolate(frame, [14, 26], [0, 118], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                overflow: "hidden",
                opacity: interpolate(frame, [14, 26], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />

            <DeviceRow
              name="homelab"
              note="Remy is running here."
              device="server"
              action={<PrimaryButton label="Pair" />}
              style={{
                height: interpolate(frame, [26, 38], [0, 118], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                overflow: "hidden",
                opacity: interpolate(frame, [26, 38], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />

            <DeviceRow
              name="attic-nas"
              note="Remy isn't answering here."
              device="drive"
              quiet
              style={{
                height: interpolate(frame, [38, 50], [0, 118], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                overflow: "hidden",
                opacity: interpolate(frame, [38, 50], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />

            <div
              style={{
                position: "absolute",
                left: -26,
                right: -26,
                height: 150,
                backgroundImage:
                  "linear-gradient(180deg, rgba(96, 165, 250, 0), rgba(96, 165, 250, 0.12), rgba(96, 165, 250, 0))",
                translate: interpolate(frame, [6, 56], ["0px -160px", "0px 400px"], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                }),
                opacity: interpolate(frame, [6, 14, 48, 58], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.linear,
                }),
              }}
            />
          </div>
        </div>
      </DeviceWindow>

      <Sfx sound="tick" at={15} />
      <Sfx sound="tick" at={27} />
      <Sfx sound="tick" at={39} />

      <Interactive.Div name="Discovery caption">
        <Caption step="01" line="Your tailnet already knows your devices." from={10} />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
