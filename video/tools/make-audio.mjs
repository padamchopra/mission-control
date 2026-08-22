// Writes the score and the interface sounds for `PairDevice` as WAV files.
//
// Synthesised here rather than licensed, for two reasons. One, a video that is
// going to be posted should not carry somebody else's rights with it. Two, the
// arrangement is cut to the video: the chord changes land on the scene cuts, the
// drums drop out where the code is being compared, and the resolution arrives on
// the frame the two machines pair. A stock track cannot do that.
//
// Run from `video/`: `node tools/make-audio.mjs`, then convert to MP3 — see the
// command at the bottom of this file. Deterministic, so re-running it produces
// byte-identical output.

import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;
const BPM = 140;
const BEAT = 60 / BPM; // 0.4286s
const BAR = BEAT * 4; // 1.7143s
const EIGHTH = BEAT / 2;
const DURATION = 15.5; // the composition is 14.73s; the tail rings past it

/// 140 BPM was chosen so that six bars land on 10.29s, which is where the Paired
/// cut is — the one moment the music has to agree with the picture. The opening
/// cut lands within 0.08s too; the middle two are off by up to 0.7s, which a
/// crossfade absorbs in a way a hard cut would not.
const bar = (n) => n * BAR;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// ── Arrangement ────────────────────────────────────────────────────────────────
//
// bar 0  0.00  Hook       Emaj9    pad swell alone
// bar 1  1.71  Discovery  Emaj9    arpeggio and hats enter
// bar 2  3.43  Discovery  C#m7     kick enters
// bar 3  5.14  Ask        Amaj9    build
// bar 4  6.86  Allow      C#m7     kick drops out — this is the beat where the
//                                  two codes are being compared, so the music
//                                  gets out of the way and the tension hangs
// bar 5  8.57  Allow      B7sus4   unresolved, building back
// bar 6 10.29  Paired     Emaj9    resolution, on the cut where they pair
// bar 7 12.00  Paired     Amaj9    peak
// bar 8 13.71  End card   Emaj9    stripped back, fading

const CHORDS = [
  { pad: [56, 59, 64, 66], bass: 40, arp: [76, 78, 71, 83, 80] }, // Emaj9
  { pad: [56, 59, 61, 64], bass: 37, arp: [73, 76, 80, 83] }, //     C#m7
  { pad: [57, 61, 64, 71], bass: 45, arp: [73, 76, 71, 78] }, //     Amaj9
  { pad: [59, 64, 66, 69], bass: 47, arp: [78, 76, 83, 81] }, //     B7sus4
];
const E = 0;
const CSM = 1;
const A = 2;
const BSUS = 3;

/// `level` scales the whole bar. Without it the arrangement measures flat: the
/// per-voice gains alone put the pad-only opening within a couple of dB of the
/// full band, and the limiter then squashes what little difference is left. The
/// shape of the video is quiet-build-drop-resolve, and the score has to have the
/// same shape or it is just a loop playing underneath.
const PLAN = [
  { chord: E, level: 0.32, pad: 0.5, bass: 0.5, arp: 0.0, hat: 0.0, kick: 0.0, snap: false },
  { chord: E, level: 0.6, pad: 0.7, bass: 0.6, arp: 0.5, hat: 0.3, kick: 0.0, snap: false },
  { chord: CSM, level: 0.74, pad: 0.7, bass: 0.6, arp: 0.6, hat: 0.34, kick: 0.5, snap: false },
  { chord: A, level: 0.84, pad: 0.74, bass: 0.62, arp: 0.72, hat: 0.4, kick: 0.62, snap: true },
  { chord: CSM, level: 0.6, pad: 0.7, bass: 0.6, arp: 0.44, hat: 0.24, kick: 0.0, snap: false },
  { chord: BSUS, level: 0.8, pad: 0.78, bass: 0.66, arp: 0.66, hat: 0.4, kick: 0.56, snap: true },
  { chord: E, level: 1.0, pad: 0.86, bass: 0.72, arp: 0.85, hat: 0.46, kick: 0.76, snap: true },
  { chord: A, level: 0.95, pad: 0.86, bass: 0.72, arp: 0.85, hat: 0.46, kick: 0.76, snap: true },
  { chord: E, level: 0.58, pad: 0.7, bass: 0.5, arp: 0.4, hat: 0.18, kick: 0.28, snap: false },
];

const ARP_SPARSE = [1, 0, 1, 0, 1, 1, 0, 1];
const ARP_FULL = [1, 0, 1, 1, 1, 0, 1, 1];

// ── Plumbing ───────────────────────────────────────────────────────────────────

let seed = 0x2f6e2b1;
/// Seeded so a re-run produces the same file. `Math.random` would make the
/// committed MP3 churn on every regeneration for no reason.
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const buffer = (seconds) => ({
  L: new Float64Array(Math.ceil(seconds * SR)),
  R: new Float64Array(Math.ceil(seconds * SR)),
});

/// Equal-power pan, so a note moved off centre does not also get quieter.
const panGains = (pan) => {
  const angle = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
};

const add = (buf, at, samples, pan, gain) => {
  const [gl, gr] = panGains(pan);
  const start = Math.round(at * SR);
  for (let i = 0; i < samples.length; i += 1) {
    const j = start + i;
    if (j < 0 || j >= buf.L.length) continue;
    buf.L[j] += samples[i] * gl * gain;
    buf.R[j] += samples[i] * gr * gain;
  }
};

/// One-pole lowpass. Two passes give a gentle 12dB/oct, which is all the pad
/// needs to stop the detuned oscillators sounding brittle.
const lowpass = (data, cutoff, passes = 1) => {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  for (let p = 0; p < passes; p += 1) {
    let y = 0;
    for (let i = 0; i < data.length; i += 1) {
      y += a * (data[i] - y);
      data[i] = y;
    }
  }
  return data;
};

const highpass = (data, cutoff) => {
  const copy = Float64Array.from(data);
  lowpass(copy, cutoff);
  for (let i = 0; i < data.length; i += 1) data[i] -= copy[i];
  return data;
};

// ── Voices ─────────────────────────────────────────────────────────────────────

/// Pad note: three slightly detuned sines plus a quiet octave, with a long
/// attack and release so consecutive chords overlap instead of stepping.
const padNote = (freq, seconds, attack, release) => {
  const n = Math.ceil(seconds * SR);
  const out = new Float64Array(n);
  const detune = [1, 1.0035, 0.9967];
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    let env;
    if (t < attack) env = t / attack;
    else if (t > seconds - release) env = Math.max(0, (seconds - t) / release);
    else env = 1;
    env = env * env * (3 - 2 * env); // smoothstep, so the joins are not linear ramps
    let s = 0;
    for (const d of detune) s += Math.sin(2 * Math.PI * freq * d * t);
    s = s / detune.length;
    s += 0.16 * Math.sin(2 * Math.PI * freq * 2 * t);
    out[i] = s * env;
  }
  return lowpass(out, 2400, 2);
};

/// Sub bass: a sine on the root with a quiet octave above for definition on
/// small speakers, which is where this will actually be watched.
const bassNote = (freq, seconds) => {
  const n = Math.ceil(seconds * SR);
  const out = new Float64Array(n);
  const attack = 0.045;
  const release = 0.28;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    let env;
    if (t < attack) env = t / attack;
    else if (t > seconds - release) env = Math.max(0, (seconds - t) / release);
    else env = 1;
    env = env * env * (3 - 2 * env);
    out[i] =
      env *
      (Math.sin(2 * Math.PI * freq * t) + 0.22 * Math.sin(2 * Math.PI * freq * 2 * t));
  }
  return lowpass(out, 900, 1);
};

/// Plucked note for the arpeggio and the chime. Harmonics decay faster than the
/// fundamental, which is what makes a mallet sound like a mallet.
const pluck = (freq, seconds, decay) => {
  const n = Math.ceil(seconds * SR);
  const out = new Float64Array(n);
  const harmonics = [
    [1, 1, 1],
    [2, 0.3, 0.55],
    [3, 0.12, 0.38],
    [4.2, 0.05, 0.25],
  ];
  const attack = 0.004;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const gate = t < attack ? t / attack : 1;
    let s = 0;
    for (const [mult, amp, decayScale] of harmonics) {
      s += amp * Math.exp(-t / (decay * decayScale)) * Math.sin(2 * Math.PI * freq * mult * t);
    }
    out[i] = s * gate * 0.5;
  }
  return out;
};

const noiseBurst = (seconds, decay, hp, lp) => {
  const n = Math.ceil(seconds * SR);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) out[i] = (rnd() * 2 - 1) * Math.exp(-i / SR / decay);
  if (hp) highpass(out, hp);
  if (lp) lowpass(out, lp, 2);
  return out;
};

/// Kick: a sine whose pitch falls from 118Hz to 46Hz in the first 90ms.
const kick = () => {
  const seconds = 0.34;
  const n = Math.ceil(seconds * SR);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const freq = 46 + 72 * Math.exp(-t / 0.028);
    phase += (2 * Math.PI * freq) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t / 0.1);
  }
  const click = noiseBurst(0.006, 0.0018, 1800, 9000);
  for (let i = 0; i < click.length; i += 1) out[i] += click[i] * 0.12;
  return out;
};

// ── The score ──────────────────────────────────────────────────────────────────

const music = buffer(DURATION);
let arpStep = 0;

PLAN.forEach((slot, b) => {
  const chord = CHORDS[slot.chord];
  const start = bar(b);

  // Pad — held a little past the bar so the next chord grows out of this one.
  chord.pad.forEach((note, i) => {
    const spread = [-0.55, -0.2, 0.2, 0.55][i] ?? 0;
    add(
      music,
      start,
      padNote(midi(note), BAR + 0.55, b === 0 ? 0.9 : 0.32, 0.5),
      spread,
      slot.level * slot.pad * 0.115,
    );
  });

  add(music, start, bassNote(midi(chord.bass), BAR + 0.2), 0, slot.level * slot.bass * 0.3);

  const mask = slot.arp >= 0.6 ? ARP_FULL : ARP_SPARSE;
  for (let s = 0; s < 8; s += 1) {
    if (!mask[s] || slot.arp === 0) continue;
    if (b === 8 && s > 3) continue; // the last bar thins out rather than stopping
    const note = chord.arp[arpStep % chord.arp.length];
    arpStep += 1;
    const accent = s === 0 ? 1 : s % 2 === 0 ? 0.82 : 0.66;
    add(
      music,
      start + s * EIGHTH,
      pluck(midi(note), 0.9, 0.34),
      (rnd() - 0.5) * 0.7,
      slot.level * slot.arp * accent * 0.16,
    );
  }

  for (let s = 0; s < 8; s += 1) {
    if (slot.hat === 0) continue;
    const accent = s % 2 === 1 ? 1 : 0.45;
    add(
      music,
      start + s * EIGHTH,
      noiseBurst(0.055, 0.011, 5200, 10500),
      s % 2 === 1 ? 0.22 : -0.22,
      slot.level * slot.hat * accent * 0.062,
    );
  }

  if (slot.kick > 0) {
    const steps = slot.kick > 0.7 ? [0, 4, 6] : [0, 4];
    for (const s of steps) add(music, start + s * EIGHTH, kick(), 0, slot.level * slot.kick * 0.5);
  }

  if (slot.snap) {
    add(music, start + 4 * EIGHTH, noiseBurst(0.14, 0.03, 900, 4200), 0.1, slot.level * 0.12);
  }
});

// ── Master ─────────────────────────────────────────────────────────────────────

const master = (buf, { fadeIn, fadeOut, fadeOutStart, peak, drive = 0.62, topTrim = 0 }) => {
  for (const ch of [buf.L, buf.R]) {
    for (let i = 0; i < ch.length; i += 1) {
      const t = i / SR;
      let g = 1;
      if (t < fadeIn) g *= t / fadeIn;
      if (t > fadeOutStart) {
        const p = Math.min(1, (t - fadeOutStart) / fadeOut);
        g *= (1 - p) ** 1.7;
      }
      // Soft knee rather than a hard clip: the pad and the kick overlap on the
      // downbeats and a hard clip there would buzz. `drive` stays low enough
      // that tanh only rounds the loudest peaks — push it and the arrangement
      // measures flat no matter what the per-bar levels say.
      ch[i] = Math.tanh(ch[i] * g * drive);
    }
  }
  if (topTrim) for (const ch of [buf.L, buf.R]) lowpass(ch, topTrim, 1);
  let max = 0;
  for (const ch of [buf.L, buf.R]) for (const v of ch) max = Math.max(max, Math.abs(v));
  const norm = max > 0 ? peak / max : 1;
  for (const ch of [buf.L, buf.R]) for (let i = 0; i < ch.length; i += 1) ch[i] *= norm;
  return buf;
};

master(music, { fadeIn: 0.12, fadeOut: 1.9, fadeOutStart: 12.9, peak: 0.89, topTrim: 14000 });

// ── Interface sounds ───────────────────────────────────────────────────────────

/// A press. Deliberately dry and quiet — it sits under a voiceover-free video,
/// so it only has to read as "that was clicked".
const uiClick = () => {
  const buf = buffer(0.16);
  add(buf, 0, pluck(1180, 0.14, 0.03), -0.08, 0.5);
  add(buf, 0, pluck(2360, 0.09, 0.018), 0.08, 0.2);
  add(buf, 0, noiseBurst(0.012, 0.003, 2200, 11000), 0, 0.22);
  return master(buf, { fadeIn: 0.001, fadeOut: 0.02, fadeOutStart: 0.135, peak: 0.72, drive: 1 });
};

/// A row resolving in the tailnet list. Higher and softer than a press, because
/// three of them fire in a row and nothing was clicked.
const uiTick = () => {
  const buf = buffer(0.1);
  add(buf, 0, pluck(2640, 0.08, 0.014), 0.12, 0.34);
  add(buf, 0, noiseBurst(0.008, 0.0022, 3400, 13000), 0, 0.1);
  return master(buf, { fadeIn: 0.001, fadeOut: 0.02, fadeOutStart: 0.075, peak: 0.42, drive: 1 });
};

/// Paired. A rising fifth, B4 to E5 — the resolution the score is landing on at
/// the same moment, so the two agree instead of fighting.
const uiPaired = () => {
  const buf = buffer(1.1);
  add(buf, 0, pluck(midi(71), 0.9, 0.3), -0.15, 0.5);
  add(buf, 0.105, pluck(midi(76), 0.95, 0.36), 0.15, 0.55);
  add(buf, 0.105, pluck(midi(83), 0.8, 0.24), 0, 0.2);
  return master(buf, { fadeIn: 0.002, fadeOut: 0.2, fadeOutStart: 0.85, peak: 0.7, drive: 1 });
};

// ── WAV out ────────────────────────────────────────────────────────────────────

const writeWav = (path, buf) => {
  const frames = buf.L.length;
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    const l = Math.max(-1, Math.min(1, buf.L[i]));
    const r = Math.max(-1, Math.min(1, buf.R[i]));
    data.writeInt16LE(Math.round(l * 32767), i * 4);
    data.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
  console.log(`${path}  ${(frames / SR).toFixed(2)}s`);
};

mkdirSync("public/audio", { recursive: true });
writeWav("public/audio/score.wav", music);
writeWav("public/audio/ui-click.wav", uiClick());
writeWav("public/audio/ui-tick.wav", uiTick());
writeWav("public/audio/ui-paired.wav", uiPaired());

console.log(`
Now convert to MP3 and drop the WAVs:

  cd public/audio
  ffmpeg -y -i score.wav     -codec:a libmp3lame -b:a 192k score.mp3
  ffmpeg -y -i ui-click.wav  -codec:a libmp3lame -b:a 160k ui-click.mp3
  ffmpeg -y -i ui-tick.wav   -codec:a libmp3lame -b:a 160k ui-tick.mp3
  ffmpeg -y -i ui-paired.wav -codec:a libmp3lame -b:a 160k ui-paired.mp3
  rm *.wav
`);
