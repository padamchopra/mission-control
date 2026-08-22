import { AbsoluteFill, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Hook } from "./scenes/Hook";
import { Discovery } from "./scenes/Discovery";
import { Ask } from "./scenes/Ask";
import { Allow } from "./scenes/Allow";
import { Paired } from "./scenes/Paired";
import { EndCard } from "./scenes/EndCard";

/// Adding a device to Remy, start to finish: your tailnet offers the list, you
/// press Pair, and somebody at the other device compares six digits and allows it.
///
/// Every string here is the app's own. The two-window stage keeps its geometry
/// fixed across the middle four scenes, so a crossfade reads as one continuous
/// take rather than four separate shots.
export const PairDevice: React.FC = () => {

  return (
    <AbsoluteFill style={{ backgroundColor: "#fcfcfc" }}>
      {/* The score lives on the master rather than in the scenes: each scene is
          also its own composition, and an <Audio> inside one would restart the
          track from the top every time. Its fades are baked into the file, so
          there is no volume curve to keep in sync here. The interface sounds do
          go in the scenes, next to the frames they belong to. */}
      <Audio src={staticFile("audio/score.mp3")} volume={0.7} />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={54} name="Hook">
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />

        <TransitionSeries.Sequence durationInFrames={96} name="Discovery">
          <Discovery />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />

        <TransitionSeries.Sequence durationInFrames={90} name="Ask">
          <Ask />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />

        <TransitionSeries.Sequence durationInFrames={102} name="Allow">
          <Allow />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />

        <TransitionSeries.Sequence durationInFrames={84} name="Paired">
          <Paired />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />

        <TransitionSeries.Sequence durationInFrames={66} name="End card">
          <EndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
