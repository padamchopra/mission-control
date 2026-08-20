import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const exec = promisify(execFile);

/// What this machine can learn about the tailnet it is on, and which of the
/// machines there are running Remy.
///
/// The point is that none of this needs pairing first. Tailscale already knows
/// every device you own and which of them are up, so Remy can offer you a list
/// to pick from instead of asking you to carry a link between two machines.

/// Candidate paths for the Tailscale CLI. The Mac App Store build keeps it
/// inside the app bundle, where it is on nobody's PATH.
const TAILSCALE_PATHS = [
  "tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
];

/// Runs the Tailscale CLI, or answers undefined when it is not here or refused.
export async function tailscale(args: string[]): Promise<string | undefined> {
  for (const bin of TAILSCALE_PATHS) {
    try {
      const { stdout } = await exec(bin, args, { timeout: 5_000, maxBuffer: 8 * 1024 * 1024 });
      return stdout;
    } catch (error) {
      // A missing binary means try the next path; anything else means Tailscale
      // is here and answered badly, which is not something another path fixes.
      if ((error as { code?: string }).code === "ENOENT") continue;
      return undefined;
    }
  }
  return undefined;
}

interface StatusPeer {
  DNSName?: string;
  OS?: string;
  Online?: boolean;
  UserID?: number;
  TailscaleIPs?: string[];
}

interface Status {
  Self?: StatusPeer;
  Peer?: Record<string, StatusPeer>;
}

async function status(): Promise<Status | undefined> {
  const stdout = await tailscale(["status", "--json"]);
  if (!stdout) return undefined;
  try {
    return JSON.parse(stdout) as Status;
  } catch {
    return undefined;
  }
}

/// This machine's name on the tailnet, without the trailing dot.
export async function tailnetHost(): Promise<string | undefined> {
  const dns = (await status())?.Self?.DNSName?.replace(/\.$/, "");
  return dns || undefined;
}

/// Whether `tailscale serve` is fronting this daemon, and on which listener.
/// Serve is the only way in: the daemon itself binds loopback.
export async function serveTarget(): Promise<{ https: boolean } | undefined> {
  const stdout = await tailscale(["serve", "status", "--json"]);
  if (!stdout) return undefined;
  try {
    const parsed = JSON.parse(stdout) as { Web?: Record<string, unknown> };
    const hosts = Object.keys(parsed.Web ?? {});
    if (hosts.length === 0) return undefined;
    // A serve key is `host:port`. 443 is the HTTPS listener; anything else is
    // tailnet HTTP, still WireGuard-encrypted but without TLS on top.
    return { https: hosts.some((host) => host.endsWith(":443")) };
  } catch {
    return undefined;
  }
}

export interface TailnetDevice {
  /// Full tailnet name, e.g. `padams-mac-mini.tail91cfc.ts.net`.
  host: string;
  /// The first label, which is what a person calls the machine.
  name: string;
  os: string;
  online: boolean;
}

/// A machine that could plausibly be running a Remy daemon. Phones and tablets
/// are on the tailnet too, and none of them hold repositories.
const DAEMON_PLATFORMS = new Set(["macos", "linux", "windows"]);

/// Your own machines on the tailnet, newest information Tailscale has.
///
/// Only devices belonging to the same tailnet user: a shared node or another
/// person's machine on the same tailnet is not somewhere to go looking for your
/// threads.
export async function tailnetDevices(): Promise<TailnetDevice[]> {
  const parsed = await status();
  const mine = parsed?.Self?.UserID;
  if (!parsed?.Peer || mine === undefined) return [];

  const devices: TailnetDevice[] = [];
  for (const peer of Object.values(parsed.Peer)) {
    const host = peer.DNSName?.replace(/\.$/, "");
    if (!host || peer.UserID !== mine) continue;
    const os = (peer.OS ?? "").toLowerCase();
    if (!DAEMON_PLATFORMS.has(os)) continue;
    devices.push({
      host,
      name: host.split(".")[0] ?? host,
      os,
      online: peer.Online === true,
    });
  }
  return devices.sort((a, b) => a.name.localeCompare(b.name));
}

export interface Found extends TailnetDevice {
  /// Where Remy answered, ready to pair with. Absent when nothing did.
  url?: string;
}

/// How long a probe waits. A tailnet machine that is up answers well inside
/// this; one that is asleep never will, and must not hold up the others.
const PROBE_MS = 2_500;
const DISCOVERY_TTL_MS = 20_000;
let cached: { found: Found[]; at: number } | undefined;

/// Whether a Remy daemon answers at a base URL, and nothing more than that.
///
/// An unauthenticated `/health` is refused rather than answered — authorisation
/// runs before any route — so **401 is the positive signal**: something is
/// there, speaking Remy, and it wants a token we do not have yet. That is
/// exactly what we need to know before offering to pair with it, and it tells a
/// caller nothing it did not already know.
async function remyAnswers(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(PROBE_MS),
    });
    return response.status === 401 || response.status === 200;
  } catch {
    return false;
  }
}

/// The first address a machine answers Remy on. HTTPS first, because that is
/// what `tailscale serve` sets up when the tailnet has certificates.
async function probe(device: TailnetDevice): Promise<Found> {
  if (!device.online) return device;
  for (const base of [`https://${device.host}`, `http://${device.host}:${config.port}`]) {
    if (await remyAnswers(base)) return { ...device, url: base };
  }
  return device;
}

/// Every machine of yours on the tailnet, each marked with where Remy answered.
/// Cached briefly so a pane that polls does not reprobe the whole tailnet.
export async function discover(force = false): Promise<Found[]> {
  if (!force && cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.found;
  const devices = await tailnetDevices();
  const found = await Promise.all(devices.map((device) => probe(device)));
  cached = { found, at: Date.now() };
  return found;
}
