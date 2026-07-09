import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";
import { assertValidName } from "./tmux.js";

export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

const uploadRoot = join(configDir, "uploads");

function sanitizeFilename(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "").trim();
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "upload.bin";
}

// Saves an uploaded file under a per-session directory and returns its absolute
// path, which the client then references in a message so Claude can read it.
export function saveUpload(session: string, filename: string, data: Buffer): string {
  assertValidName(session);
  const dir = join(uploadRoot, session);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${Date.now()}-${sanitizeFilename(filename)}`);
  writeFileSync(path, data);
  return path;
}
