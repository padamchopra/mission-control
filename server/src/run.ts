import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";

const rawExec = promisify(execFile);

// External/USB volumes intermittently interrupt git/tmux syscalls — most often
// `getcwd()` returning EINTR ("Interrupted system call") — because this Node
// server runs child processes while live PTYs deliver SIGCHLD. EINTR is
// transient, so retry a few times with a brief backoff before giving up.
export async function run(
  file: string,
  args: string[],
  options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  // Hard cap so a stalled external/network volume can never hang a request
  // indefinitely — the command is killed and the caller degrades gracefully.
  // Callers may override with a longer/shorter timeout.
  const withTimeout: ExecFileOptions = { timeout: 15_000, ...options };
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await rawExec(file, args, withTimeout);
      return { stdout: String(result.stdout), stderr: String(result.stderr) };
    } catch (error) {
      lastError = error;
      const detail = String((error as { stderr?: unknown; message?: unknown })?.stderr ?? (error as Error)?.message ?? "");
      if (!/Interrupted system call|EINTR/i.test(detail)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
  throw lastError;
}
