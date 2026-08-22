# video

[Remotion](https://remotion.dev) compositions for Remy's product videos. Nothing
here ships in the app — it renders MP4s to post.

## Add a device

`PairDevice` is the 22-second explainer for adding a machine: your tailnet offers
the list, you press Pair, and somebody at the other Mac compares six digits and
allows it. Light theme, 1920×1080, 30fps — sized for a timeline embed.

```sh
cd video && npm i
npx remotion studio            # preview, scrub, edit
npx remotion render PairDevice out/remy-add-a-device.mp4 --codec=h264 --crf=18
```

The newest render is committed at `docs/video/remy-add-a-device.mp4`.

## How it is put together

| Path | What it is |
|---|---|
| `src/pair/PairDevice.tsx` | The six scenes, crossfaded by `TransitionSeries`. |
| `src/pair/scenes/` | One file per scene. Each is also registered on its own in `src/Root.tsx`, so you can open and trim it in the Studio. |
| `src/pair/parts/` | The app's surfaces at video scale — the window, a tailnet row, the waiting panel, the pair dialog, the seam link between two machines. |
| `tools/make-audio.mjs` | Synthesises the score and the three interface sounds. |
| `public/audio/` | Its output, committed as MP3. |

Some rules the scenes are held to:

- **The strings are the app's.** "Remy is running here.", "Waiting for mac-mini",
  the whole pair dialog — they are copied from `web/src/components/Settings.tsx`
  and `PairRequest.tsx`, not rewritten. A video that says something the window
  does not is a video that has to be re-shot when the window changes.
- **The colours are the app's.** Remy's light-scheme tokens from
  `web/src/index.css`, converted from oklch to the hex each style names — so
  `#1b4ed8` is `--primary`, `#71717b` is `--muted-foreground`, and a frame here
  matches a screenshot of the window.
- **The two-window stage never moves.** Scenes 3 to 5 place both windows at the
  same coordinates and keep every row the same height, so a crossfade between
  them reads as one continuous take instead of a cut. Retime a scene and you have
  to check the cut frames again — a window that has started sliding during a
  crossfade shows up as a double image.
- **Animate with `useCurrentFrame()`.** CSS transitions and Tailwind's
  `animate-*` do not render. Keep `interpolate()` calls inline in `style` so the
  Studio can keyframe them.
- **Fonts load in `src/Root.tsx`.** `sideEffects` in `package.json` lists CSS
  only, so a side-effect-only `import "./fonts"` gets tree-shaken and every scene
  falls back to the browser's serif.

## Sound

`tools/make-audio.mjs` writes all of it — nothing here is licensed from anywhere,
so the video carries no rights but yours. It is also cut to the picture in a way
a stock track cannot be: 112 BPM puts a bar line within ~0.1s of four of the five
scene cuts, the drums drop out through the bar where the two codes are being
compared, and the chord resolves on the frame the link turns green.

```sh
node tools/make-audio.mjs      # writes public/audio/*.wav
                               # then convert to MP3 — the script prints how
```

It is deterministic, so re-running it without changing anything rewrites the same
bytes. The arrangement is the `PLAN` array: one row per bar, `level` scaling the
whole bar and the rest scaling a voice. Reach for `level` first — the per-voice
gains alone measure almost flat, because the pad-only opening is within a couple
of dB of the full band and the limiter then flattens what is left.

The score sits on the master composition in `PairDevice.tsx`; its fades are baked
into the file rather than driven by a volume curve. The three interface sounds
(`Sfx`) sit in the scenes on the frame each one belongs to, so a scene opened by
itself in the Studio still sounds right.

**Swapping in a licensed track:** replace `public/audio/score.mp3` and check the
level on `<Audio>` in `PairDevice.tsx`. The interface sounds are independent and
can stay.
