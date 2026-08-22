import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts/Backdrop";
import { Caption } from "../parts/Caption";
import { Chrome } from "../parts/Chrome";
import { DeviceRow } from "../parts/DeviceRow";
import { PrimaryButton } from "../parts/Buttons";
import { MacWindow } from "../parts/MacWindow";
import { RefreshCw } from "../parts/Icons";

/// Step one. Nothing has been asked of anybody yet — this is only Tailscale's
/// own list of your machines, with the ones answering Remy marked. The `401`
/// badge is the real signal: an un-tokened `/health` that refuses is Remy.
export const Discovery: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />
      <Chrome step={1} />

      <MacWindow
        name="studio"
        note="this machine"
        device="laptop"
        style={{
          position: "absolute",
          top: 176,
          left: 570,
          width: 780,
          opacity: interpolate(frame, [0, 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 22], [0.965, 1], {
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
                color: "#27272a",
              }}
            >
              On your tailnet
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  rotate: interpolate(frame, [8, 74], ["0deg", "720deg"], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                  }),
                }}
              >
                <RefreshCw size={26} color="#71717b" />
              </div>
              <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 28, color: "#71717b" }}>
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
              name="mac-mini"
              note="Remy is running here."
              device="monitor"
              action={<PrimaryButton label="Pair" />}
              badge={
                <span
                  style={{
                    marginRight: 14,
                    padding: "7px 16px",
                    borderRadius: 999,
                    border: "1.5px solid #d5e0fa",
                    backgroundColor: "#eef3fe",
                    fontFamily: "JetBrains Mono, Menlo, monospace",
                    fontSize: 24,
                    color: "#1b4ed8",
                    opacity: interpolate(frame, [44, 56], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                    }),
                  }}
                >
                  401
                </span>
              }
              style={{
                height: interpolate(frame, [26, 40], [0, 118], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                overflow: "hidden",
                opacity: interpolate(frame, [26, 40], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />

            <DeviceRow
              name="macbook-air"
              note="Remy is running here."
              device="laptop"
              action={<PrimaryButton label="Pair" />}
              badge={
                <span
                  style={{
                    marginRight: 14,
                    padding: "7px 16px",
                    borderRadius: 999,
                    border: "1.5px solid #d5e0fa",
                    backgroundColor: "#eef3fe",
                    fontFamily: "JetBrains Mono, Menlo, monospace",
                    fontSize: 24,
                    color: "#1b4ed8",
                    opacity: interpolate(frame, [62, 74], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                    }),
                  }}
                >
                  401
                </span>
              }
              style={{
                height: interpolate(frame, [44, 58], [0, 118], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                overflow: "hidden",
                opacity: interpolate(frame, [44, 58], [0, 1], {
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
                height: interpolate(frame, [62, 76], [0, 118], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                overflow: "hidden",
                opacity: interpolate(frame, [62, 76], [0, 1], {
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
                  "linear-gradient(180deg, rgba(27, 78, 216, 0), rgba(27, 78, 216, 0.09), rgba(27, 78, 216, 0))",
                translate: interpolate(frame, [10, 82], ["0px -160px", "0px 400px"], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                }),
                opacity: interpolate(frame, [10, 24, 68, 84], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.linear,
                }),
              }}
            />
          </div>
        </div>
      </MacWindow>

      <Interactive.Div name="Discovery caption">
        <Caption
          step="01"
          line="Your tailnet already knows every machine you own."
          detail="an un-tokened /health that answers 401 is Remy saying hello"
          from={18}
        />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
