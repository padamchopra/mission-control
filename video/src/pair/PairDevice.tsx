import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Hook } from "./scenes/Hook";
import { Discovery } from "./scenes/Discovery";
import { Ask } from "./scenes/Ask";
import { Allow } from "./scenes/Allow";
import { Paired } from "./scenes/Paired";
import { EndCard } from "./scenes/EndCard";

/// Adding a device to Remy, start to finish: your tailnet offers the list, you
/// press Pair, and somebody at the other Mac compares six digits and allows it.
///
/// Every string here is the app's own. The two-window stage keeps its geometry
/// fixed across the middle four scenes, so a crossfade reads as one continuous
/// take rather than four separate shots.
export const PairDevice: React.FC = () => {

  return (
    <AbsoluteFill style={{ backgroundColor: "#fcfcfc" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={75} name="Hook">
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />

        <TransitionSeries.Sequence durationInFrames={150} name="Discovery">
          <Discovery />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />

        <TransitionSeries.Sequence durationInFrames={132} name="Ask">
          <Ask />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />

        <TransitionSeries.Sequence durationInFrames={144} name="Allow">
          <Allow />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />

        <TransitionSeries.Sequence durationInFrames={126} name="Paired">
          <Paired />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />

        <TransitionSeries.Sequence durationInFrames={90} name="End card">
          <EndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
