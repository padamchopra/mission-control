# Remy — agent guide

Remy is a remote for [Claude Code](https://claude.com/claude-code) on your own
machines. A daemon runs on the Mac that holds the repos; the Electron window,
the browser, and the iOS app are all views onto it. Nothing is copied to a
cloud. `README.md` is the product story — this file is how to work in the code.

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`; both stay in sync.

## Running it locally

Once:

```sh
npm run install:all   # server, web, desktop
```

Then:

```sh
npm run dev:web
```

That starts Vite on `http://127.0.0.1:5173`. It talks to the same daemon as the
DMG (`127.0.0.1:8420`) and the same database (`~/.remy/remy.db`) — chats,
workspaces, settings, token. If Remy.app is already running, Vite attaches to
that process and does not start a second server.

Open the browser at `http://127.0.0.1:5173`. This is the way to run Remy —
`npm run dev:web` and a browser tab. Offer it, and nothing else, unless the
person asks for the desktop app by name.

When they do ask for Electron, leave `npm run dev:web` running and start the
window from a second terminal:

```sh
npm run dev   # Electron, pointed at the same Vite server
```

**UI changes** — leave Remy.app open or quit it; either way the page is your
local `web/`.

**Server changes** (`server/`) — quit Remy.app first, then `npm run dev:web`
again so the clone's daemon starts. Two processes cannot both own port 8420.

Skip `VITE_MC_FIXTURE=1`; that is fake data, not your real state.

## Layout

| Path | What it is |
|---|---|
| `web/` | The UI. React 19, Tailwind v4, [shadcn/ui](https://ui.shadcn.com) New York (Radix) in `web/src/components/ui`. Zustand store in `web/src/state`. Run `npx shadcn@latest add` from `web/`. |
| `server/` | The daemon. Node + TypeScript, binds `127.0.0.1` only, SQLite at `~/.remy/remy.db` (`node:sqlite`). Chats run through the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview). |
| `desktop/` | Thin Electron shell (`me.padamchopra.Remy`). Owns the window and the tokens; ships the same `web/` build plus the daemon in the DMG. |
| `ios/` | SwiftUI companion (XcodeGen). Still speaks the older session/tmux remote. |
| `deploy/` | Optional launchd login item, Claude/Codex hooks, `tailscale serve`, pairing QR. |
| `.agents/skills/` | House rules — read the relevant one before touching that area. |
| `.github/workflows/mac.yml` | Signs, notarizes, and releases the DMG on every push to `main`. |

`web/vite.config.ts` is doing more than it looks: it spawns the local daemon if
one is not up, proxies `/api` to it, and injects the bearer token from
`~/.remy/remy.db` on each request so the token never reaches the page.

## Skills

`.agents/skills` holds the conventions that reviews are held to. Read the one
that covers what you are about to change:

- **`ui`** — layout and keyboard for the web UI. Every control comes from a
  shadcn primitive in `web/src/components/ui`; a custom `div`/`button` is the
  last resort. This project is Radix, not Base. Toast is `sonner`.
- **`content`** — every user-facing string. Second person, present tense, one
  short sentence. An empty state is a next action, not a caption.
- **`qa`** — after any visual or interaction change, open the running app and
  click it the way a person would before calling it done.
- **`shadcn`**, **`migrate-radix-to-base`** — vendored from `shadcn/ui`, tracked
  in `skills-lock.json`. Do not hand-edit; they are upstream copies.

## Checks

```sh
npm run typecheck    # web + desktop
npm test             # server: tsc, then node --test on dist/*.test.js
npm run shots        # Playwright PNGs of the window
npm run live-check   # assert the window is actually showing chats
npm run pack:mac     # web + daemon + Electron DMG → desktop/release/
```

A server module opens its database at import time, so a test that touches state
points `MC_CONFIG_DIR` (or `HOME`) at a `mkdtempSync` directory **before** the
dynamic `await import(...)` of the module under test — see
`server/src/chat-storage.test.ts`. A static import runs first and would open the
real `~/.remy/remy.db`, corrupting someone's chats. `node:test` gives each file
its own process, so the override cannot leak sideways.

## Conventions

- **Comments** explain why, not what, and use `///` on exported declarations in
  TypeScript. Match the density of the file you are in; the codebase is sparse.
- **No shell strings.** The server reaches `git`, `gh`, and `tmux` through
  `execFile` with an argument array. Never build a command line, never
  interpolate a path or a branch name into one.
- **Loopback only.** The daemon binds `127.0.0.1` behind a bearer token; the way
  in from another device is `tailscale serve`. Do not widen the bind.
- **Config lives in the database**, not in env vars or dotfiles — `kv` in
  `~/.remy/remy.db`, read through `server/src/config.ts`. `~/.mission-control`
  is the legacy directory and is still honoured when `~/.remy` is absent.
- **Commit subjects** are a sentence in the imperative, no prefix or scope tag:
  "Store chats in SQLite instead of a file each", "Notarize the Mac DMG for
  Gatekeeper". PRs land squashed with the `(#n)` suffix.
- **Version** is `{major}.{minor}.{run}` — the run number comes from CI. Do not
  bump `version` in `package.json` by hand for a release.

## Prerequisites

Node 22.5+ (for `node:sqlite`), `git`, `gh` authenticated (pull requests),
Claude Code on the machine, `tmux` for the older session remote. Tailscale only
if another device needs to reach the daemon.
