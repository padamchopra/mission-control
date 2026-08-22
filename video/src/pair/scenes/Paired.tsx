import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts/Backdrop";
import { Caption } from "../parts/Caption";
import { Chrome } from "../parts/Chrome";
import { DeviceRow } from "../parts/DeviceRow";
import { PrimaryButton } from "../parts/Buttons";
import { MacWindow } from "../parts/MacWindow";
import { PairDialog } from "../parts/PairDialog";
import { RefreshCw } from "../parts/Icons";
import { SeamLink } from "../parts/SeamLink";
import { SkeletonPane } from "../parts/SkeletonPane";
import { Toast, TicketChip } from "../parts/Toast";
import { PairedPanel, WaitingPanel } from "../parts/WaitingPanel";
import { Sfx } from "../parts/Sfx";

/// The payoff. `mac-mini` leaves the tailnet list because it is a device now,
/// and the two boards start converging — which is a merge against a version
/// vector, not a copy, so neither machine is the one that holds the truth.
export const Paired: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop />
      <Chrome step={4} />

      <MacWindow
        name="studio"
        note="paired with mac-mini"
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
            <div style={{ position: "relative", height: 192, marginBottom: 14 }}>
              <WaitingPanel
                name="mac-mini"
                code="418 902"
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: interpolate(frame, [4, 20], [1, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                }}
              />
              <PairedPanel
                name="mac-mini"
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: interpolate(frame, [10, 28], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  scale: interpolate(frame, [10, 34], [0.97, 1], {
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
                name="mac-mini"
                note="Remy is running here."
                device="monitor"
                action={<PrimaryButton label="Pair" />}
                style={{
                  height: interpolate(frame, [18, 40], [118, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  overflow: "hidden",
                  opacity: interpolate(frame, [18, 34], [0.5, 0], {
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
                style={{
                  opacity: interpolate(frame, [18, 40], [0.5, 1], {
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
              backgroundImage: "linear-gradient(180deg, rgba(255, 255, 255, 0), #ffffff)",
            }}
          />
        </div>
      </MacWindow>

      <MacWindow
        name="mac-mini"
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
              backgroundColor: "rgba(252, 252, 252, 0.74)",
              opacity: interpolate(frame, [2, 22], [1, 0], {
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
              opacity: interpolate(frame, [0, 16], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              scale: interpolate(frame, [0, 20], [1, 0.955], {
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
              opacity: interpolate(frame, [26, 42, 110, 122], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(frame, [26, 44], ["0px 22px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          />
        </div>
      </MacWindow>

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [0, 16], [1, 0], {
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
          opacity: interpolate(frame, [8, 26], [0, 1], {
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
          left: interpolate(frame, [32, 68], [700, 1300], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          top: interpolate(frame, [32, 68], [598, 654], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          opacity: interpolate(frame, [32, 41, 59, 68], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      />

      <TicketChip
        label="REMY-38"
        style={{
          left: interpolate(frame, [74, 110], [1300, 700], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          top: interpolate(frame, [74, 110], [654, 598], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          opacity: interpolate(frame, [74, 83, 101, 110], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      />

      <Sfx sound="paired" at={8} />

      <Interactive.Div name="Paired caption">
        <Caption
          step="✓"
          line="Now the two boards converge."
          detail="threads stay on the machine that holds the repo"
          from={22}
        />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
