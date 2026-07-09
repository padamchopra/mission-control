# Mission Control

Native iOS remote for the Claude Code session fleet running in tmux on the Mac mini.
Replaces Claude remote control with a stack where the source of truth never leaves
the mini: the terminal is streamed straight from tmux, and input is injected locally
with `tmux send-keys`, so nothing can go stale or get dropped in a sync layer.

```
┌──────────────┐   Tailscale (WireGuard)   ┌─────────────────────────────┐
│  iOS app     │ ◄──────────────────────►  │  Mac mini                   │
│  (SwiftUI +  │   REST + WebSocket        │  server/ (Node, launchd)    │
│   SwiftTerm) │                           │    ├─ tmux ls / send-keys   │
└──────────────┘                           │    ├─ PTY ↔ WS streaming    │
      ▲                                    │    ├─ event registry        │
      │ APNs / Telegram pings              │    └─ notifier              │
      └────────────────────────────────────│  hooks/ (Claude Code hooks) │
                                           └─────────────────────────────┘
```

## Components

- **`server/`** — Node/TypeScript daemon on the mini. Lists tmux sessions with
  status, streams panes over WebSocket (PTY-backed, feeds SwiftTerm), injects
  input via `tmux send-keys`, kills sessions, receives Claude Code hook events,
  and sends notifications (Telegram now, APNs when configured).
- **`server/hooks/`** — Claude Code hook scripts (SessionStart / Notification /
  Stop) that POST events to the server. Gated on `TICKET_BOT=1` so only
  spawner-launched sessions report; interactive sessions stay silent.
- **`ios/`** — SwiftUI app. Session list with status chips and swipe-to-kill;
  terminal view rendered by SwiftTerm with a native input bar and quick keys
  (Esc, arrows, digits, Ctrl+C); push notifications deep-link into a session.
- **`deploy/`** — setup script for the mini: launchd service, tailscale serve,
  hook installation.

## Setup

**Mini (server):** clone the repo, then `./deploy/setup-mini.sh`. It builds the
server, installs it as a launchd service, registers the Claude Code hooks, and
prints the URL + token to paste into the app. Re-run it after every `git pull`.

**iOS app:** `cd ios && xcodegen generate`, open `MissionControl.xcodeproj`,
run on your phone. In the app: **Settings → "Scan pairing QR"** and scan the QR
the setup script printed (reprint anytime with `./deploy/show-pairing.sh`). No
username or manual token entry — the QR carries the URL and token.

**Spawner:** launch ticket sessions with `TICKET_BOT=1` in the environment so
their hooks report to Mission Control; all other Claude sessions stay silent.

## Security model

- The server binds to `127.0.0.1` only. The **sole** path in from outside is
  `tailscale serve` (not funnel) — tailnet devices only, never the public
  internet or the LAN. Prefer HTTPS (real `*.ts.net` cert); falls back to
  tailnet-HTTP (still WireGuard-encrypted) if the tailnet hasn't enabled HTTPS
  certs.
- Shared bearer token on every request/WS upgrade as a second factor. Paired to
  the app by QR, so it never has to be typed.
- The server shells out to `tmux` only with validated session names; no
  arbitrary command execution endpoint exists.

## Terminal scrolling

`tmux attach` keeps no scrollback on the client, so the app scrolls via tmux's
own copy-mode driven by `send-keys` — the same reliable path as every other
input. Drag on the terminal to scroll (finger travel maps to copy-mode lines);
a "Jump to live" pill appears only while scrolled up, gated on tmux's actual
`pane_in_mode` state (updated from each scroll response plus a 2s poll).

## Workspaces

Save a location on the mini as a workspace (from a session's `...` menu →
"Save location as workspace"). The home screen then groups sessions by which
workspace their current directory sits under, with anything else under "Other".
Each workspace header has a **+** that opens a fresh shell tmux session `cd`'d
into that path. Remove a workspace via long-press on its header.

## Session menu

The `...` menu in a session offers: **Open in claude.ai** (built from the Claude
Code `session_id` the hooks capture), **View pull request** (resolved with `gh`
from the session's directory), **Save location as workspace**, and **Kill
session**. Killing a session that lives in a git worktree then offers to remove
the worktree (branch kept; a force is required — and confirmed — only if there
are uncommitted changes).

## Notifications (APNs)

Push is Apple-only (no Telegram). To enable it, on the mini drop
`~/.mission-control/apns.json` next to your APNs auth key (`.p8`):

```json
{ "keyId": "ABC123DEF4", "teamId": "YOURTEAMID", "bundleId": "dev.raccoons.missioncontrol",
  "keyFile": "/Users/you/.mission-control/AuthKey_ABC123DEF4.p8", "production": false }
```

Create the key at developer.apple.com → Keys → **+** → enable *Apple Push
Notifications service (APNs)*. The app registers its device token on launch,
pushes carry the needs-input badge count, tapping a push opens that session, and
a push offers **Yes (1)** / **No (3)** actions to answer a permission prompt
without opening the app. Until `apns.json` exists, notifications are simply not
sent.

## Media sharing

The composer accepts photos/videos three ways: **paste** an image directly into
the field (like iOS Messages — a UITextView routes clipboard images to an
attachment), the **+** button for Photo Library (images + video) or Camera, and
removable thumbnail chips before sending. On send, each file is uploaded to the
mini (`POST /sessions/:name/upload` → `~/.mission-control/uploads/<session>/`)
and its absolute path is appended to the message text, so Claude Code reads it
(images especially — that's how Claude ingests them).

## Connection resilience

The terminal WebSocket auto-reconnects with exponential backoff (6 attempts),
showing a live "Reconnecting… (n/6)" banner, then a "Disconnected — Retry"
banner once it gives up. Because tmux holds the session server-side, a
reconnect just re-attaches and repaints — nothing is lost.
