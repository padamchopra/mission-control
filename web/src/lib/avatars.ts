/// Faces for your own messages.
///
/// The built-in ones are drawn here rather than fetched: this window talks to
/// loopback and nothing else, so an avatar service is not an option. An emoji
/// on a saturated disc is full colour at any size, needs no asset, and looks
/// like somebody rather than like an icon.

export interface AvatarPreset {
  id: string;
  label: string;
  emoji: string;
  /// The disc behind it. Written out per preset so each can be read as the
  /// thing it looks like.
  className: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "alien", label: "Alien", emoji: "👾", className: "bg-gradient-to-br from-violet-500 to-fuchsia-600" },
  { id: "fox", label: "Fox", emoji: "🦊", className: "bg-gradient-to-br from-orange-400 to-red-500" },
  { id: "octopus", label: "Octopus", emoji: "🐙", className: "bg-gradient-to-br from-pink-400 to-rose-600" },
  { id: "unicorn", label: "Unicorn", emoji: "🦄", className: "bg-gradient-to-br from-fuchsia-400 to-purple-600" },
  { id: "frog", label: "Frog", emoji: "🐸", className: "bg-gradient-to-br from-lime-400 to-emerald-600" },
  { id: "cactus", label: "Cactus", emoji: "🌵", className: "bg-gradient-to-br from-emerald-400 to-teal-600" },
  { id: "pizza", label: "Pizza", emoji: "🍕", className: "bg-gradient-to-br from-amber-400 to-orange-600" },
  { id: "ufo", label: "UFO", emoji: "🛸", className: "bg-gradient-to-br from-sky-400 to-indigo-600" },
  { id: "fire", label: "Fire", emoji: "🔥", className: "bg-gradient-to-br from-yellow-400 to-red-600" },
  { id: "wave", label: "Wave", emoji: "🌊", className: "bg-gradient-to-br from-cyan-400 to-blue-600" },
  { id: "bolt", label: "Bolt", emoji: "⚡", className: "bg-gradient-to-br from-yellow-300 to-amber-500" },
  { id: "brain", label: "Brain", emoji: "🧠", className: "bg-gradient-to-br from-rose-300 to-pink-500" },
  { id: "ghost", label: "Ghost", emoji: "👻", className: "bg-gradient-to-br from-slate-300 to-slate-500" },
  { id: "robot", label: "Robot", emoji: "🤖", className: "bg-gradient-to-br from-zinc-400 to-slate-600" },
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
