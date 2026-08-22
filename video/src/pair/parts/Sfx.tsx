import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

const FILES = {
  click: "audio/ui-click.mp3",
  tick: "audio/ui-tick.mp3",
  paired: "audio/ui-paired.mp3",
} as const;

/// A tick is softer than a click because three of them fire in a row and nothing
/// was pressed; the chime is loudest because it is the moment the video is for.
const LEVELS = { click: 0.85, tick: 0.62, paired: 0.9 } as const;

/// An interface sound, placed on the frame the thing it belongs to happens.
///
/// `at` is a frame in the scene's own timeline, not the master's, so a scene
/// opened on its own in the Studio still sounds right. All three files come out
/// of `tools/make-audio.mjs`.
/// The level goes through a callback because `@remotion/volume-callback` cannot
/// see that a lookup is constant. These are one-shots a few frames long, so
/// there is no curve to describe — the callback just answers the same number.
export const Sfx: React.FC<{ sound: keyof typeof FILES; at: number }> = ({ sound, at }) => (
  <Sequence from={at} name={`sfx:${sound}`} layout="none">
    <Audio src={staticFile(FILES[sound])} volume={() => LEVELS[sound]} />
  </Sequence>
);
