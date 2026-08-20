import { spawn, execFile as execFileCb } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { app, BrowserWindow } from "electron";

const execFile = promisify(execFileCb);

/// Downloads the GitHub DMG and, on a second click, swaps this .app for the
/// one inside it. Opening the asset URL in the renderer goes through
/// `openExternal`, which is Chrome's save dialog — the opposite of installing.

export type UpdateProgress = { received: number; total: number };

const REMY_DOWNLOAD = /^https:\/\/github\.com\/padamchopra\/remy\/releases\/download\/[^/]+\/[^/]+\.dmg$/i;

let downloadedDmg: string | undefined;
let downloading = false;
let lastProgressAt = 0;

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

/// GitHub's release asset URL, before the redirect to objects.githubusercontent.com.
export function isReleaseAssetUrl(url: string): boolean {
  try {
    return REMY_DOWNLOAD.test(new URL(url).href);
  } catch {
    return false;
  }
}

/// Where this running copy lives. A DMG volume is a throwaway mount, so those
/// install into /Applications instead of replacing the disk image.
export function installTarget(runningBundle: string): string {
  if (runningBundle.startsWith("/Volumes/")) return join("/Applications", basename(runningBundle));
  return runningBundle;
}

/// `Remy.app` that is currently running, so the helper replaces the right copy.
export function runningAppBundle(): string {
  return join(process.execPath, "..", "..", "..");
}

async function findAppBundle(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  const apps: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      apps.push(full);
      continue;
    }
    if (entry.isDirectory()) {
      const nested = await readdir(full, { withFileTypes: true });
      for (const child of nested) {
        if (child.isDirectory() && child.name.endsWith(".app")) apps.push(join(full, child.name));
      }
    }
  }
  const remy = apps.find((path) => basename(path) === "Remy.app");
  const chosen = remy ?? apps[0];
  if (!chosen) throw new Error("Couldn't find Remy in the installer.");
  return chosen;
}

async function stripQuarantine(path: string, recursive = false): Promise<void> {
  try {
    await execFile("/usr/bin/xattr", recursive ? ["-dr", "com.apple.quarantine", path] : ["-d", "com.apple.quarantine", path]);
  } catch {
    // Files written by fetch usually have no quarantine flag.
  }
}

/// Pulls the DMG into temp. The renderer never sees the bytes; GitHub's asset
/// URL in a page `<a>` is what Chrome's save dialog was catching.
export async function downloadUpdate(url: string): Promise<void> {
  if (!app.isPackaged) throw new Error("Updates install from the shipped Remy app.");
  if (!isReleaseAssetUrl(url)) throw new Error("That isn't a Remy installer.");
  if (downloading) return;
  downloading = true;
  lastProgressAt = 0;
  const dest = join(app.getPath("temp"), `Remy-${Date.now()}.dmg`);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": `Remy/${app.getVersion()}` },
      redirect: "follow",
    }).catch(() => {
      throw new Error("Couldn't download the update.");
    });
    if (!response.ok || !response.body) throw new Error("Couldn't download the update.");
    const total = Number(response.headers.get("content-length")) || 0;
    const file = createWriteStream(dest);
    let received = 0;
    const body = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
    body.on("data", (chunk: Buffer) => {
      received += chunk.length;
      const now = Date.now();
      if (now - lastProgressAt < 80 && received !== total) return;
      lastProgressAt = now;
      broadcast("app:update-progress", { received, total } satisfies UpdateProgress);
    });
    try {
      await pipeline(body, file);
    } catch {
      await rm(dest, { force: true });
      throw new Error("Couldn't download the update.");
    }
    if (received < 1_000_000) {
      await rm(dest, { force: true });
      throw new Error("The download didn't look like a Remy installer.");
    }
    if (downloadedDmg && downloadedDmg !== dest) await rm(downloadedDmg, { force: true }).catch(() => {});
    downloadedDmg = dest;
    broadcast("app:update-progress", { received, total: total || received } satisfies UpdateProgress);
  } finally {
    downloading = false;
  }
}

/// Mounts the DMG, copies the new .app aside, then quits. A helper waiting on
/// this PID does the swap — replacing the bundle while it is still running is
/// what leaves people dragging a DMG onto Applications by hand.
export async function installUpdate(): Promise<void> {
  if (!app.isPackaged) throw new Error("Updates install from the shipped Remy app.");
  if (!downloadedDmg) throw new Error("Download the update first.");
  const dmg = downloadedDmg;
  const dest = installTarget(runningAppBundle());
  const mountRoot = join(tmpdir(), `remy-update-${Date.now()}`);
  const staging = join(tmpdir(), `Remy-${Date.now()}.app`);
  await mkdir(mountRoot, { recursive: true });
  await stripQuarantine(dmg);
  try {
    await execFile(
      "/usr/bin/hdiutil",
      ["attach", "-nobrowse", "-readonly", "-quiet", "-mountroot", mountRoot, dmg],
      { timeout: 60_000 },
    );
  } catch {
    await rm(mountRoot, { recursive: true, force: true }).catch(() => {});
    throw new Error("Couldn't open the installer.");
  }
  try {
    const source = await findAppBundle(mountRoot);
    await execFile("/usr/bin/ditto", [source, staging], { timeout: 120_000 });
    await stripQuarantine(staging, true);
  } catch (error) {
    await detachMount(mountRoot);
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (error instanceof Error && error.message === "Couldn't find Remy in the installer.") throw error;
    throw new Error("Couldn't copy the new app.");
  }
  await detachMount(mountRoot);
  const helper = join(tmpdir(), `remy-install-${Date.now()}.sh`);
  await writeFile(helper, INSTALL_HELPER, { mode: 0o755 });
  const child = spawn("/bin/bash", [helper, String(process.pid), staging, dest, dmg, helper], {
    detached: true,
    stdio: "ignore",
  });
  if (child.pid == null) throw new Error("Couldn't start the installer.");
  child.unref();
  downloadedDmg = undefined;
  // Let the IPC reply land so the renderer can show Installing… before we die.
  setTimeout(() => app.quit(), 50);
}

async function detachMount(mountRoot: string): Promise<void> {
  try {
    const volumes = await readdir(mountRoot);
    for (const name of volumes) {
      try {
        await execFile("/usr/bin/hdiutil", ["detach", join(mountRoot, name), "-quiet"], { timeout: 15_000 });
      } catch {
        await execFile("/usr/bin/hdiutil", ["detach", join(mountRoot, name), "-force", "-quiet"], {
          timeout: 15_000,
        }).catch(() => {});
      }
    }
  } finally {
    await rm(mountRoot, { recursive: true, force: true }).catch(() => {});
  }
}

/// Runs after this process exits, so the copy is not fighting a live bundle.
const INSTALL_HELPER = `#!/bin/bash
set -euo pipefail
pid="$1"
source_app="$2"
dest_app="$3"
dmg="$4"
self="$5"

deadline=$((SECONDS + 60))
while /bin/kill -0 "$pid" 2>/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    /usr/bin/osascript -e 'display notification "Remy was still running, so the update was not installed." with title "Remy"'
    exit 1
  fi
  /bin/sleep 0.2
done

/bin/rm -rf "$dest_app"
if ! /usr/bin/ditto "$source_app" "$dest_app"; then
  /usr/bin/osascript -e 'display notification "Could not replace Remy. Install the DMG from GitHub." with title "Remy"'
  exit 1
fi
/bin/rm -rf "$source_app"
/bin/rm -f "$dmg"
/usr/bin/open "$dest_app"
/bin/rm -f "$self"
`;
