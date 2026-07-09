import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface Config {
  port: number;
  token: string;
}

export const configDir = join(homedir(), ".mission-control");
const configFile = join(configDir, "config.json");

function load(): Config {
  mkdirSync(configDir, { recursive: true });
  if (existsSync(configFile)) {
    const parsed = JSON.parse(readFileSync(configFile, "utf8"));
    if (typeof parsed.token === "string" && parsed.token.length >= 32) {
      return { port: Number(parsed.port) || 8420, token: parsed.token };
    }
  }
  const fresh: Config = { port: 8420, token: randomBytes(32).toString("hex") };
  writeFileSync(configFile, JSON.stringify(fresh, null, 2) + "\n");
  chmodSync(configFile, 0o600);
  return fresh;
}

export const config = load();
