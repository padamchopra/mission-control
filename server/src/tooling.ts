import { homedir } from "node:os";
import { run as exec } from "./run.js";

/// What the command-line tools Remy leans on report about themselves, so
/// Settings can say "gh is not signed in" instead of leaving someone to work it
/// out from a failed pull request.

export interface ToolStatus {
  available: boolean;
  version?: string;
  /// Only `gh` sets this: installed is not the same as signed in.
  authenticated?: boolean;
  account?: string;
  /// Why the tool could not be used, when it could not.
  error?: string;
}

export interface Tooling {
  git: ToolStatus;
  gh: ToolStatus;
  claude: ToolStatus;
}

/// Version output is one line of prose (`git version 2.39.5`, `gh version 2.62.0
/// (2024-11-14)`), so keep the first version-looking number and drop the rest.
function versionFrom(output: string): string | undefined {
  const line = output.split("\n").find((entry) => entry.trim()) ?? "";
  return /\d+\.\d+[^\s]*/.exec(line)?.[0] ?? (line.trim() || undefined);
}

async function probe(file: string, args: string[]): Promise<ToolStatus> {
  try {
    const { stdout } = await exec(file, args, { cwd: homedir(), timeout: 5_000 });
    return { available: true, version: versionFrom(stdout) };
  } catch (error) {
    // A missing binary and a binary that failed to run are the same thing to
    // the person reading this: the feature that needs it will not work.
    const detail = (error as { code?: unknown })?.code === "ENOENT"
      ? "Not installed"
      : ((error as Error)?.message ?? "Could not run it").split("\n")[0];
    return { available: false, error: detail };
  }
}

/// `gh auth status` exits non-zero when signed out, and writes its report to
/// stderr on older builds, so both streams are read and the exit code is only a
/// hint.
async function ghStatus(): Promise<ToolStatus> {
  const base = await probe("gh", ["--version"]);
  if (!base.available) return base;
  try {
    const { stdout, stderr } = await exec("gh", ["auth", "status"], { cwd: homedir(), timeout: 8_000 });
    return { ...base, ...readGhAuth(`${stdout}\n${stderr}`) };
  } catch (error) {
    const output = String((error as { stdout?: unknown })?.stdout ?? "")
      + String((error as { stderr?: unknown })?.stderr ?? "");
    return { ...base, ...readGhAuth(output) };
  }
}

/// `gh` has phrased this both ways across versions — "account <name>" and the
/// older "as <name>" — so both connectives are consumed rather than being read
/// as the account itself.
export function readGhAuth(output: string): { authenticated: boolean; account?: string } {
  const account = /Logged in to \S+ (?:account |as )?([A-Za-z0-9-]+)/.exec(output)?.[1];
  if (account) return { authenticated: true, account };
  return { authenticated: /Logged in to/.test(output) };
}

export async function tooling(): Promise<Tooling> {
  const [git, gh, claude] = await Promise.all([
    probe("git", ["--version"]),
    ghStatus(),
    probe("claude", ["--version"]),
  ]);
  return { git, gh, claude };
}
