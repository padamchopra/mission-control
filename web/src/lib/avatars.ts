/// Faces for your own messages.
///
/// The built-in ones are generated rather than fetched: this window talks to
/// loopback and nothing else, so an avatar service is not an option. Each seed
/// draws the same abstract mark every time — overlapping shapes in one hue
/// family — which is what an avatar is for: telling one person from another at
/// a glance, without being a picture of anything.

export interface AvatarArt {
  background: string;
  circle: string;
  band: string;
  /// Where the shapes sit, so two seeds with close hues still differ.
  offsetX: number;
  offsetY: number;
  rotation: number;
}

/// The seeds offered in Settings. Named for the palette each lands on, so the
/// list reads as choices rather than as numbers.
export const AVATAR_SEEDS = [
  "ember",
  "aurora",
  "reef",
  "orchid",
  "moss",
  "dusk",
  "coral",
  "tide",
  "amber",
  "iris",
  "fern",
  "slate",
];

/// A stable 32-bit hash. Two seeds that differ anywhere land far apart.
function hash(seed: string): number {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

export function avatarArt(seed: string): AvatarArt {
  const h = hash(seed);
  // A hash spreads unevenly over a dozen short words, and a picker where half
  // the choices are the same orange is not a choice. The offered seeds take
  // their hue from their place in the list; anything else falls back to the
  // hash, so a seed from somewhere else still draws something stable.
  const known = AVATAR_SEEDS.indexOf(seed);
  const hue = known >= 0 ? Math.round((known * 360) / AVATAR_SEEDS.length) : h % 360;
  return {
    background: `hsl(${hue} 62% 42%)`,
    circle: `hsl(${(hue + 38) % 360} 78% 62%)`,
    band: `hsl(${(hue + 76) % 360} 82% 72%)`,
    offsetX: ((h >> 3) % 7) - 3,
    offsetY: ((h >> 6) % 7) - 3,
    rotation: (h >> 9) % 180,
  };
}

export function seedFor(avatar: string | undefined): string | undefined {
  if (!avatar?.startsWith("preset:")) return undefined;
  const seed = avatar.slice("preset:".length);
  return seed || undefined;
}

export function isImageAvatar(avatar: string | undefined): boolean {
  return Boolean(avatar?.startsWith("data:image/"));
}

/// The longest side an avatar is stored at. A settings row keeps it in the
/// database, so a photo straight off a phone is resized before it gets there.
const MAX_EDGE = 128;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/// Reads a picked file into a square `data:` URL, cropped to its centre.
export async function readAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is too large.");

  const source = await createImageBitmap(file);
  const edge = Math.min(source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = MAX_EDGE;
  canvas.height = MAX_EDGE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize that image.");
  context.drawImage(
    source,
    (source.width - edge) / 2,
    (source.height - edge) / 2,
    edge,
    edge,
    0,
    0,
    MAX_EDGE,
    MAX_EDGE,
  );
  source.close();
  // A photo is far smaller as a JPEG, and an avatar has no transparency worth
  // keeping.
  return canvas.toDataURL("image/jpeg", 0.82);
}
