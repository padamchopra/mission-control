# Security model & review

Mission Control drives a fleet of Claude Code sessions on a personal machine
that may hold sensitive source and credentials, so the server is treated as
security-relevant even though it's only meant to be reachable by its owner.

## Threat model

- **Reachability:** the server binds to `127.0.0.1` only. The single path in
  from outside is `tailscale serve` (not funnel) — tailnet devices only,
  TLS-terminated, never the LAN or public internet.
- **Authentication:** a 256-bit random bearer token (`~/.mission-control/config.json`,
  `chmod 600`), compared with `timingSafeEqual`, required on every request and
  on the WebSocket upgrade. Header only — never a query parameter — so it can't
  leak into request logs.
- **No arbitrary execution:** there is no "run this command" endpoint. The
  server only invokes `tmux` (and one `tmux attach` PTY) via `execFile`/`spawn`
  with argv arrays — never a shell — so input is never interpreted as a command.

## Input handling

- **Session names** must match `^[A-Za-z0-9_][A-Za-z0-9._-]*$` (≤128 chars).
  The leading-char rule means a name can never be read as a tmux flag (`-…`) or
  a path segment (`.`/`..`/leading dot). Names are always passed as the value of
  `tmux -t`, never as a bare argument.
- **Keys** are a fixed whitelist (Enter, Escape, arrows, Ctrl-C, …) plus single
  alphanumerics; anything else is rejected.
- **Text** is delivered through a per-call `load-buffer`/`paste-buffer` (via
  stdin, bracketed-paste), never as an argv, so it can't inject tmux commands.
- **Scroll actions** are validated against a fixed set; line counts are clamped.
- **Uploads** save under `$TMPDIR/mission-control-uploads/<session>/`; filenames
  are reduced to their basename, stripped to `[A-Za-z0-9._-]` with leading dots
  removed (no traversal), and capped at 64 MB. `$TMPDIR` is auto-purged by macOS.
- **Device tokens** must be hex (`[a-f0-9]{16,}`).
- **Bodies** are size-capped (256 KB JSON, 64 MB upload).
- **Errors** return a generic message; details are logged server-side only.

## Residual risks (accepted)

- **No rate limiting.** Acceptable for a single-user, tailnet-only, token-gated
  service.
- **Terminal input reaches the pane's program.** Inherent to any terminal
  remote — you are typing into your own shell.
- **Device-token list isn't pruned** on APNs 410 responses (grows slowly; no
  security impact).
