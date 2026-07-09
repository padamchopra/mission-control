import { execFile } from "node:child_process";
import * as pty from "node-pty";
import type { WebSocket } from "ws";
import { assertValidName } from "./tmux.js";

// Streams a live tmux attach through a PTY to the WebSocket. The client sends
// JSON control frames ({type:"input"|"resize"}); raw terminal bytes flow back.
export function attachStream(ws: WebSocket, name: string, params: URLSearchParams): void {
  try {
    assertValidName(name);
  } catch {
    ws.close(1008, "invalid session name");
    return;
  }
  const cols = clamp(Number(params.get("cols")), 20, 500, 90);
  const rows = clamp(Number(params.get("rows")), 5, 300, 40);

  // Most recently sized client wins, so a phone attach reflows the TUI to fit.
  execFile("tmux", ["set-option", "-t", name, "window-size", "latest"], () => {});

  let term: pty.IPty;
  try {
    term = pty.spawn("tmux", ["attach-session", "-t", name], {
      name: "xterm-256color",
      cols,
      rows,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });
  } catch (err) {
    ws.close(1011, err instanceof Error ? err.message : "attach failed");
    return;
  }

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  term.onExit(() => ws.close(1000, "detached"));

  ws.on("message", (raw) => {
    let msg: { type?: string; data?: string; cols?: number; rows?: number };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "input" && typeof msg.data === "string") {
      term.write(msg.data);
    } else if (msg.type === "resize") {
      term.resize(clamp(Number(msg.cols), 20, 500, cols), clamp(Number(msg.rows), 5, 300, rows));
    }
  });
  ws.on("close", () => term.kill());
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
