# Remy

A remote for [Claude Code](https://claude.com/claude-code) on your own machines.
Start a chat in a folder, pick the model and how much Claude may do unasked, and
drive the turn from this Mac — or from another device on your
[Tailscale](https://tailscale.com) network.

The work stays on the machine. Remy is a window onto a daemon that already runs
there, not a copy of the repo in the cloud.

## How it works

```
┌──────────────┐   Tailscale or loopback    ┌──────────────────────────────┐
│  Desktop app │ ◄────────────────────────► │  Machine                     │
│  (Electron)  │   REST + WebSocket         │  server/ (Node, launchd)     │
│  web/ UI     │                            │    ├─ Agent SDK chats        │
└──────────────┘                            │    ├─ workspaces / git       │
      ▲                                     │    ├─ event registry         │
      │ ntfy (when desktop is closed)       │    └─ ntfy notifier          │
      └─────────────────────────────────────│  hooks/ (tmux agents, still) │
┌──────────────┐                            └──────────────────────────────┘
│  iOS app     │  pairing + older session remote
└──────────────┘
```

- **`web/`** — the UI: React 19, Tailwind v4, [shadcn/ui](https://ui.shadcn.com)
  (Radix, New York). Add primitives with `npx shadcn@latest add` from `web/`.
  Sidebar: Inbox, Chats, Workspaces, Pull requests, Loops. ⌘K is the palette.
- **`desktop/`** — a thin Electron shell (`me.padamchopra.Remy`). It owns the
  window and the tokens; the UI is the same web app. Dev (`npm run dev` /
  `dev:web`) starts the local daemon if it isn't already running. A packaged
  Mac DMG is built on push to `main`; it talks to the daemon from `setup.sh`
  / launchd.
- **`server/`** — a Node/TypeScript daemon on each machine. Binds to
  `127.0.0.1` only. Chats are conversations Remy runs itself through the
  [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview): the
  server holds the Claude process, keeps the feed in SQLite
  (`~/.remy/remy.db`), streams each turn, and parks tool approvals and questions
  until someone answers. Workspaces, git checkouts, loops, archives, and
  settings live in the same database.
- **`server/src/sleep.ts`** — optional idle-sleep assertion (`caffeinate -i`).
  Off, while a chat is working or waiting on you, or always until you change it
  or the machine powers off. Closing the lid can still sleep a MacBook.
- **`ios/`** — SwiftUI companion (XcodeGen). Pair with a `remy://` link. It still
  speaks the session/tmux remote; chats are the web/desktop product.
- **`deploy/`** — one setup script (launchd + hooks + `tailscale serve`).

## Running it

```sh
npm run install:all     # server, web, desktop
npm run dev:web         # Vite on :5173; starts the local daemon if needed
npm run dev             # Electron, pointed at the dev server
```

`VITE_MC_FIXTURE=1 npm run dev:web` fills the window with sample data, so layout
can be reviewed without a server. Otherwise Vite proxies `/api` to
`127.0.0.1:8420` and injects the bearer header from `~/.remy/remy.db` (or
`MC_TOKEN`) so the token never reaches the page.

```sh
npm run pack:mac     # web + Electron DMG → desktop/release/
npm run shots        # Playwright PNGs of the window
npm run live-check   # assert the window is showing chats
```

## What you can do

- **New chat** — empty Chats is a composer, not a blank list. Pick a workspace
  or a device (`~` on that machine), Default / Opus / Sonnet / Haiku, and a
  permission mode (Ask, Auto, Accept edits, Plan, Bypass). Enter sends;
  Shift+Enter is a newline.
- **Git on send** — a workspace with worktrees gets a branch search and Main
  checkout vs New worktree. Switching the dropdown does not touch git; send
  does. A remote ref is added detached.
- **Inbox** — anything waiting on you, across paired machines.
- **Workspaces** — a folder on a machine, with icon and tint. Linked git
  worktrees group under the primary checkout.
- **Devices** — this machine plus anything you pair. Each online box has Stay
  awake: Off, While working, or Always.
- **Updates** — Settings → General shows the version and checks GitHub for a
  newer one. A launchd-installed server can still be updated from
  Settings → Server maintenance on the iOS/older remote.
- **Archived chats** — live in Settings, not in the sidebar.

A chat's Claude process is retired after 15 idle minutes and the next message
resumes the same conversation.

## Prerequisites

- A Mac that can stay on, with [Homebrew](https://brew.sh), Node 22.5+
  (`node:sqlite`), `git`, and the [GitHub CLI](https://cli.github.com) (`gh`,
  authenticated — for pull requests).
- [Claude Code](https://claude.com/claude-code) on that machine.
- [Tailscale](https://tailscale.com) if you want another device to reach it.
- `tmux` (the setup script still registers session hooks). Codex is optional.
- Optional: the free [ntfy](https://ntfy.sh) app on a phone for pushes when
  the desktop app is closed.

## Setup

### This Mac

For a login-item daemon and tailnet serve:

```sh
git clone <this-repo> ~/remy
cd ~/remy
./deploy/setup.sh
```

That builds the server, installs launchd (`com.example.remy`, auto-start on
login), registers Claude Code (and Codex) hooks when those CLIs are present,
exposes the server with `tailscale serve`, and prints a pairing QR. Reprint it
with `./deploy/show-pairing.sh`.

The server binds to `127.0.0.1` only. The way in from another device is
`tailscale serve` (tailnet only). For TLS, enable HTTPS certificates in the
Tailscale admin console first; otherwise it falls back to tailnet HTTP (still
WireGuard-encrypted).

### Pairing another machine

Paste a `remy://configure?url=…` link in Settings → Devices. The Electron app
can pair; the Vite preview talks to whatever it is proxying.

### iOS

```sh
cd ios
xcodegen generate
open MissionControl.xcodeproj
```

Copy `ios/Config/Signing.local.xcconfig.example` to
`ios/Config/Signing.local.xcconfig` and set your team. That file is gitignored
and survives `xcodegen generate`. Scan the pairing QR from the setup script.

### Notifications

Pushes go through [ntfy](https://ntfy.sh). Setup generates a random topic. If
the desktop app is open, banners land there and the phone stays quiet; quit it
and ntfy takes over within about 30 seconds.

With hosted `ntfy.sh`, notification text transits their server — kept terse.
Self-host and set `ntfyServer` in `~/.remy/remy.db` to keep it on your
infrastructure.

## Security

The server shells out to `git`/`gh` (and `tmux`, when a session remote is used)
via `execFile` with argument arrays, never a shell. It is reachable only on
loopback or your tailnet, behind a bearer token. See [SECURITY.md](SECURITY.md).

## Notes

- **Uploaded media** lives under the OS temp directory, which macOS purges on
  its own.
- **Context window.** Transcripts record the model but not always the window
  size. If sessions run a 1M window, set `contextLimit` in `~/.remy/remy.db`.
- **Repos on a removable volume** (`/Volumes/…`) need Full Disk Access for the
  server's `node` binary. System Settings → Privacy & Security → Full Disk
  Access → `readlink -f "$(command -v node)"`, then
  `launchctl kickstart -k gui/$(id -u)/com.example.remy`.
- **Stay awake** prevents *idle* sleep. Lid-close on a MacBook is a different
  event and can still sleep the machine.
- **Server updates** from an older install still need a manual `git pull`,
  `npm ci`, `npm run build`, and launchd restart once; after that, the
  authenticated update endpoint can do it.
