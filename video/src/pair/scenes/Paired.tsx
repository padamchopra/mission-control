import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts/Backdrop";
import { Caption } from "../parts/Caption";
import { Chrome } from "../parts/Chrome";
import { DeviceRow } from "../parts/DeviceRow";
import { PrimaryButton } from "../parts/Buttons";
import { DeviceWindow } from "../parts/DeviceWindow";
import { PairDialog } from "../parts/PairDialog";
import { RefreshCw } from "../parts/Icons";
import { SeamLink } from "../parts/SeamLink";
import { SkeletonPane } from "../parts/SkeletonPane";
import { Toast, TicketChip } from "../parts/Toast";
import { PairedPanel, WaitingPanel } from "../parts/WaitingPanel";
import { Sfx } from "../parts/Sfx";

/// The payoff. `workbench` leaves the tailnet list because it is a device now,
/// and the two boards start converging.
export const Paired: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />
      <Chrome step={4} />

      <DeviceWindow
        name="studio"
        note="paired with workbench"
        device="laptop"
        linked
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
            <div style={{ position: "relative", height: 192, marginBottom: 14 }}>
              <WaitingPanel
                name="workbench"
                code="418 902"
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: interpolate(frame, [2, 14], [1, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                }}
              />
              <PairedPanel
                name="workbench"
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: interpolate(frame, [6, 20], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  scale: interpolate(frame, [6, 24], [0.97, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                    output: "perceptual-scale",
                  }),
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <DeviceRow
                name="workbench"
                note="Remy is running here."
                device="monitor"
                action={<PrimaryButton label="Pair" />}
                style={{
                  height: interpolate(frame, [12, 30], [118, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  overflow: "hidden",
                  opacity: interpolate(frame, [12, 26], [0.5, 0], {
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
                  opacity: interpolate(frame, [12, 30], [0.5, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                }}
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
        note="paired with studio"
        device="monitor"
        linked
        style={{ position: "absolute", top: 176, left: 1036, width: 780 }}
      >
        <div style={{ position: "relative", height: 440 }}>
          <SkeletonPane />

          <div
            style={{
              position: "absolute",
              inset: -26,
              backgroundColor: "rgba(10, 10, 10, 0.72)",
              opacity: interpolate(frame, [2, 16], [1, 0], {
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
              opacity: interpolate(frame, [0, 12], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              scale: interpolate(frame, [0, 14], [1, 0.955], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                output: "perceptual-scale",
              }),
            }}
          >
            <PairDialog fromName="studio" code="418 902" allowBusy />
          </div>

          <Toast
            text="Pairing with studio."
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              opacity: interpolate(frame, [16, 28, 70, 80], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(frame, [16, 30], ["0px 22px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          />
        </div>
      </DeviceWindow>

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [0, 12], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <SeamLink tone="asking" draw={1} label={1} badge={1} />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [6, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <SeamLink tone="paired" draw={1} label={1} badge={1} />
      </div>

      <TicketChip
        label="REMY-41"
        style={{
          left: interpolate(frame, [20, 50], [700, 1300], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          top: interpolate(frame, [20, 50], [598, 654], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          opacity: interpolate(frame, [20, 27, 43, 50], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      />

      <TicketChip
        label="REMY-38"
        style={{
          left: interpolate(frame, [52, 82], [1300, 700], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          top: interpolate(frame, [52, 82], [654, 598], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          opacity: interpolate(frame, [52, 59, 75, 82], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      />

      <Sfx sound="paired" at={6} />

      <Interactive.Div name="Paired caption">
        <Caption step="✓" line="Now the two boards converge." from={12} />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
