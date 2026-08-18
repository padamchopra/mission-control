import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/// Merges class lists so a caller's utility wins over a component's default
/// instead of both landing in the class attribute and CSS order deciding.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/// Abbreviates a home directory to `~`. The server reports absolute paths and
/// the client has no `$HOME`, so the prefix is matched structurally rather than
/// compared against a known value.
export function displayPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}
