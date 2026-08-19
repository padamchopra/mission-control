import {
  Anchor,
  Bird,
  Bot,
  Cat,
  Flame,
  Ghost,
  Rocket,
  Sprout,
  type LucideIcon,
} from "lucide-react";

/// Faces for your own messages.
///
/// The built-in ones are drawn here rather than fetched: this window talks to
/// loopback and nothing else, so an avatar service is not an option, and a
/// glyph on a colour is cheap, legible at 32px, and never a broken image.

export interface AvatarPreset {
  id: string;
  label: string;
  icon: LucideIcon;
  /// Tailwind classes for the disc. Written out rather than composed, so each
  /// one can be read as the thing it looks like.
  className: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "ghost", label: "Ghost", icon: Ghost, className: "bg-violet-500/20 text-violet-300" },
  { id: "rocket", label: "Rocket", icon: Rocket, className: "bg-orange-500/20 text-orange-300" },
  { id: "cat", label: "Cat", icon: Cat, className: "bg-amber-500/20 text-amber-300" },
  { id: "bird", label: "Bird", icon: Bird, className: "bg-sky-500/20 text-sky-300" },
  { id: "bot", label: "Bot", icon: Bot, className: "bg-emerald-500/20 text-emerald-300" },
  { id: "flame", label: "Flame", icon: Flame, className: "bg-rose-500/20 text-rose-300" },
  { id: "sprout", label: "Sprout", icon: Sprout, className: "bg-lime-500/20 text-lime-300" },
  { id: "anchor", label: "Anchor", icon: Anchor, className: "bg-cyan-500/20 text-cyan-300" },
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
