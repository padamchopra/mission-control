import cobaltCyclops from "@/assets/avatars/cobalt-cyclops.jpg";
import coralSprout from "@/assets/avatars/coral-sprout.jpg";
import lavenderJelly from "@/assets/avatars/lavender-jelly.jpg";
import mintCrescent from "@/assets/avatars/mint-crescent.jpg";
import tangerineSunburst from "@/assets/avatars/tangerine-sunburst.jpg";
import turquoiseCloud from "@/assets/avatars/turquoise-cloud.jpg";

/// Faces for your own messages.
///
/// The built-in ones ship with the app rather than being fetched: this window
/// talks to loopback and nothing else, so an avatar service is not an option.
/// They are stored at 128px — an avatar renders at 32, so that covers retina
/// several times over — and as JPEG, since the art has no transparency to keep.

export interface AvatarPreset {
  id: string;
  label: string;
  src: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "cobalt-cyclops", label: "Cobalt cyclops", src: cobaltCyclops },
  { id: "coral-sprout", label: "Coral sprout", src: coralSprout },
  { id: "lavender-jelly", label: "Lavender jelly", src: lavenderJelly },
  { id: "mint-crescent", label: "Mint crescent", src: mintCrescent },
  { id: "tangerine-sunburst", label: "Tangerine sunburst", src: tangerineSunburst },
  { id: "turquoise-cloud", label: "Turquoise cloud", src: turquoiseCloud },
];

export function presetFor(avatar: string | undefined): AvatarPreset | undefined {
  if (!avatar?.startsWith("preset:")) return undefined;
  return AVATAR_PRESETS.find((entry) => entry.id === avatar.slice("preset:".length));
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
