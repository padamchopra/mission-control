import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import { join } from "node:path";
import { configDir } from "./config.js";

// Activated by dropping ~/.mission-control/apns.json next to the .p8 key:
//   { "keyId": "ABC123", "teamId": "DEF456", "bundleId": "dev.raccoons.missioncontrol",
//     "keyFile": "/Users/me/.mission-control/AuthKey_ABC123.p8", "production": true }
// Until that file exists every call here is a silent no-op.

interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  keyFile: string;
  production?: boolean;
}

const apnsConfigFile = join(configDir, "apns.json");
const devicesFile = join(configDir, "devices.json");

export function apnsConfigured(): boolean {
  return loadConfig() !== undefined;
}

export function registerDevice(token: string): void {
  if (!/^[a-f0-9]{16,}$/i.test(token)) throw new Error("invalid device token");
  const tokens = loadDevices();
  if (!tokens.includes(token)) {
    tokens.push(token);
    writeFileSync(devicesFile, JSON.stringify(tokens, null, 2) + "\n");
  }
}

export async function sendPush(title: string, body: string, session: string): Promise<void> {
  const config = loadConfig();
  if (!config) return;
  const tokens = loadDevices();
  if (tokens.length === 0) return;

  const jwt = makeJwt(config);
  const host = config.production === false ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const payload = JSON.stringify({
    aps: { alert: { title, body: body.slice(0, 500) }, sound: "default" },
    session,
  });

  const client = connect(host);
  try {
    await Promise.all(tokens.map((token) => pushToDevice(client, config, jwt, token, payload)));
  } finally {
    client.close();
  }
}

function pushToDevice(
  client: ReturnType<typeof connect>,
  config: ApnsConfig,
  jwt: string,
  token: string,
  payload: string,
): Promise<void> {
  return new Promise((resolve) => {
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.setEncoding("utf8");
    let responseBody = "";
    req.on("data", (chunk) => (responseBody += chunk));
    req.on("close", () => {
      if (status !== 200) console.error(`apns push to ${token.slice(0, 8)}… failed: ${status} ${responseBody}`);
      resolve();
    });
    req.on("error", (err) => {
      console.error("apns request error:", err);
      resolve();
    });
    req.end(payload);
  });
}

function makeJwt(config: ApnsConfig): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) }));
  const key = createPrivateKey(readFileSync(config.keyFile, "utf8"));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${signature.toString("base64url")}`;
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function loadConfig(): ApnsConfig | undefined {
  if (!existsSync(apnsConfigFile)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(apnsConfigFile, "utf8")) as ApnsConfig;
    return parsed.keyId && parsed.teamId && parsed.bundleId && existsSync(parsed.keyFile) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function loadDevices(): string[] {
  if (!existsSync(devicesFile)) return [];
  try {
    const parsed = JSON.parse(readFileSync(devicesFile, "utf8"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
