import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/// Merges class lists so a caller's utility wins over a component's default
/// instead of both landing in the class attribute and CSS order deciding.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
