# Remy

A remote for [Claude Code](https://claude.com/claude-code) on your own machines.
Start a chat in a folder, pick the model and how much Claude may do unasked, and
drive the turn from this Mac — or from another device on your
[Tailscale](https://tailscale.com) network.

The work stays on the machine. Remy is a window onto a daemon that runs
there, not a copy of the repo in the cloud.

## How it works

```
┌──────────────┐   loopback (or Tailscale)  ┌──────────────────────────────┐
│  Remy.app    │ ◄────────────────────────► │  bundled server              │
│  (Electron)  │   REST + WebSocket         │    ├─ Agent SDK chats        │
│  web/ UI     │                            │    ├─ workspaces / git       │
└──────────────┘                            │    ├─ event registry         │
                                            │    └─ ntfy notifier          │
┌──────────────┐                            │  hooks/ (tmux agents, still) │
│  iOS app     │  pairing + older session   └──────────────────────────────┘
└──────────────┘
```

- **`web/`** — the UI: React 19, Tailwind v4, [shadcn/ui](https://ui.shadcn.com)
  (Radix, New York). Add primitives with `npx shadcn@latest add` from `web/`.
  Sidebar: Inbox, Chats, Workspaces, Pull requests, Loops. ⌘K is the palette.
- **`desktop/`** — a thin Electron shell (`me.padamchopra.Remy`). It owns the
  window and the tokens; the UI is the same web app. The Mac DMG ships the UI
  and the daemon. Opening Remy starts the daemon with Electron's Node; quitting
  Remy stops it. Chats use the Claude Code already on this Mac. A nightly
  workflow builds that DMG.
- **`server/`** — a Node/TypeScript daemon. Binds to `127.0.0.1` only. Chats are
  conversations Remy runs itself through the
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
- **`deploy/`** — optional login-item + Tailscale serve + pairing QR, if you
  want the daemon without the app open or to reach it from another device.

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
npm run pack:mac     # web + daemon + Electron DMG → desktop/release/
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

Install the latest Remy DMG from [GitHub Releases](https://github.com/padamchopra/remy/releases).
That is the whole local install: window and daemon. Open Remy and it starts
listening on `127.0.0.1`. Claude Code still needs to be on this machine.

GitHub Releases are Developer ID–signed and notarized, so double-click works.
A local `npm run pack:mac` without those certificates is ad-hoc: after you copy
it into Applications, clear quarantine once:

```sh
xattr -cr /Applications/Remy.app
```

To reach it from another device, or to keep the daemon up when Remy is quit,
also run the login-item script from a clone:

```sh
git clone <this-repo> ~/remy
cd ~/remy
./deploy/setup.sh
```

That installs launchd (`com.example.remy`, auto-start on login), registers
Claude Code (and Codex) hooks when those CLIs are present, exposes the server
with `tailscale serve`, and prints a pairing QR. Reprint it with
`./deploy/show-pairing.sh`.

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

Pushes go through [ntfy](https://ntfy.sh). The first launch writes a random
topic. If Remy is open, banners land there. A login-item install (`setup.sh`)
keeps the daemon up after you quit, so ntfy can still reach a phone.

With hosted `ntfy.sh`, notification text transits their server — kept terse.
Self-host and set `ntfyServer` in `~/.remy/remy.db` to keep it on your
infrastructure.

## Security

The server shells out to `git`/`gh` (and `tmux`, when a session remote is used)
via `execFile` with argument arrays, never a shell. It is reachable only on
loopback or your tailnet, behind a bearer token. See [SECURITY.md](SECURITY.md).

## Publishing a Mac build

macOS will not open a GitHub download unless Apple has notarized it. The
`Mac` workflow signs with a Developer ID and notarizes before
it publishes a new GitHub release. It runs at 00:05 UTC each night, and on
demand from the Actions tab when a merge is worth shipping sooner. A night with
nothing new stops before the build: a release that is the same commit as the
last one is only a new number. Asking for a run by hand always builds. The tag
is `{major}.{minor}.{run}` from `package.json` plus the workflow run number
(`v0.1.5`, `v0.1.6`, …), so each build shows up as its own release.
Without the secrets below,
that job fails on purpose so an unsigned build never ships.

1. Enrol in the [Apple Developer Program](https://developer.apple.com/programs/).
2. In Keychain Access, create a **Developer ID Application** certificate,
   export it as a `.p12`, then `base64 -i Remy.p12 | pbcopy`.
3. In [App Store Connect](https://appstoreconnect.apple.com/access/api) →
   Integrations → Team Keys, create a key with Developer access. Download the
   `.p8` once. Note the Key ID and the Issuer ID.
4. Add these GitHub Actions secrets on `padamchopra/remy`:

   | Secret | Value |
   |---|---|
   | `CSC_LINK` | base64 of the `.p12` |
   | `CSC_KEY_PASSWORD` | password for that `.p12` |
   | `APPLE_API_KEY` | the `.p8` itself (`gh secret set APPLE_API_KEY < AuthKey_….p8`) or a base64 of that file |
   | `APPLE_API_KEY_ID` | the Key ID |
   | `APPLE_API_ISSUER` | the Issuer UUID |
   | `APPLE_TEAM_ID` | 10-character Team ID |

5. Wait for the nightly, or run the **Mac** workflow from the Actions tab.
   Each run publishes a new release; the DMG is then double-clickable.

## Notes

- **Uploaded media** lives under the OS temp directory, which macOS purges on
  its own.
- **Context window.** Transcripts record the model but not always the window
  size. If sessions run a 1M window, set `contextLimit` in `~/.remy/remy.db`.
- **Repos on a removable volume** (`/Volumes/…`) need Full Disk Access for
  Remy (System Settings → Privacy & Security → Full Disk Access).
- **Stay awake** prevents *idle* sleep. Lid-close on a MacBook is a different
  event and can still sleep the machine.
- **Server updates** from a `setup.sh` / launchd install can use the
  authenticated update endpoint after one manual `git pull` + rebuild. A DMG
  install updates by downloading the next Remy release.
