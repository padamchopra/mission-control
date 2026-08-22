import "./index.css";
import { Composition, Folder } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { PairDevice } from "./pair/PairDevice";
import { Hook } from "./pair/scenes/Hook";
import { Discovery } from "./pair/scenes/Discovery";
import { Ask } from "./pair/scenes/Ask";
import { Allow } from "./pair/scenes/Allow";
import { Paired } from "./pair/scenes/Paired";
import { EndCard } from "./pair/scenes/EndCard";

/// Loaded here rather than from a side-effect-only module: `sideEffects` in
/// package.json lists CSS alone, so a bare `import "./fonts"` is shaken out of
/// the bundle and every scene renders in the browser's default serif. Styles
/// still spell the family out as a literal so they stay editable in the Studio.
loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
loadJetBrainsMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PairDevice"
        component={PairDevice}
        durationInFrames={657}
        fps={30}
        width={1920}
        height={1080}
      />

      <Folder name="PairDevice-Scenes">
        <Composition
          id="Hook"
          component={Hook}
          durationInFrames={75}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Discovery"
          component={Discovery}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Ask"
          component={Ask}
          durationInFrames={132}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Allow"
          component={Allow}
          durationInFrames={144}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Paired"
          component={Paired}
          durationInFrames={126}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="EndCard"
          component={EndCard}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};
