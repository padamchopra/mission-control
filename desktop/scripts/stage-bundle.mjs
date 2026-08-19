// Stages the Node daemon next to the desktop app so the DMG is a single install.
// Uses an official Node binary (not Homebrew): Homebrew Node pulls in a dozen
// Cellar dylibs that would not be on someone else's Mac.
//
// electron-builder skips a top-level `node_modules` in extraResources, so
// desktop/package.json copies `build/server/node_modules` as its own entry.
import { chmodSync, copyFileSync, cpSync, createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const NODE_VERSION = process.env.REMY_NODE_VERSION || "v22.18.0";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const serverSrc = join(root, "server");
const cacheDir = join(root, "desktop/build");
const out = join(cacheDir, "server");

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function download(url, dest) {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download ${url}: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(dest));
}

async function bundleOfficialNode(destDir) {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const name = `node-${NODE_VERSION}-darwin-${arch}`;
  const tar = join(cacheDir, `${name}.tar.gz`);
  await download(`https://nodejs.org/dist/${NODE_VERSION}/${name}.tar.gz`, tar);
  run("tar", ["-xzf", tar, "-C", cacheDir]);
  mkdirSync(join(destDir, "bin"), { recursive: true });
  const binary = join(cacheDir, name, "bin/node");
  copyFileSync(binary, join(destDir, "bin/node"));
  chmodSync(join(destDir, "bin/node"), 0o755);
  rmSync(join(cacheDir, name), { recursive: true, force: true });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

run("npm", ["run", "build"], serverSrc);

cpSync(join(serverSrc, "dist"), join(out, "dist"), {
  recursive: true,
  filter: (src) => !src.endsWith(".test.js") && !src.endsWith(".test.js.map"),
});
copyFileSync(join(serverSrc, "package.json"), join(out, "package.json"));
copyFileSync(join(serverSrc, "package-lock.json"), join(out, "package-lock.json"));
if (existsSync(join(serverSrc, "hooks"))) {
  cpSync(join(serverSrc, "hooks"), join(out, "hooks"), { recursive: true });
}

run("sips", ["-z", "1024", "1024", join(root, "web/src/assets/remy-mark.png"), "--out", join(cacheDir, "icon.png")]);

await bundleOfficialNode(out);

// Native addons (node-pty) must match the bundled Node, not Homebrew.
run("npm", ["ci", "--omit=dev"], out, {
  ...process.env,
  PATH: `${join(out, "bin")}:${process.env.PATH ?? ""}`,
});

console.log(`staged ${out} with Node ${NODE_VERSION} (${process.arch})`);
