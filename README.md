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

## Security model

- Reachable only over the tailnet (WireGuard-encrypted, device identity).
- Shared bearer token on every request/WS upgrade as a second factor.
- The server shells out to `tmux` only with validated session names; no
  arbitrary command execution endpoint exists.
