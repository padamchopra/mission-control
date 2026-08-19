import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/// Where Remy keeps its database. A test sets `MC_CONFIG_DIR` so it never
/// touches the real home directory. Unset in normal operation, including under
/// launchd.
export const configDir = process.env.MC_CONFIG_DIR
  ? resolve(process.env.MC_CONFIG_DIR)
  : homeConfigDir();

function homeConfigDir(): string {
  const remy = join(homedir(), ".remy");
  const legacy = join(homedir(), ".mission-control");
  return existsSync(remy) || !existsSync(legacy) ? remy : legacy;
}

mkdirSync(configDir, { recursive: true });
