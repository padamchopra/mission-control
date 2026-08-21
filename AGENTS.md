# Remy — agent guide

Remy is a remote for [Claude Code](https://claude.com/claude-code) on your own machines. A daemon runs on the Mac that holds the repos; the Electron window, the browser, and the iOS app are views onto it. Nothing is copied to a cloud.

`README.md` is the product story. This file is how to work in the code.

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`; both stay in sync.

## Running it locally

Once: `npm run install:all` — server, web, desktop.

Then `npm run dev:web`, and open `http://127.0.0.1:5173`.

That is the way to run Remy. Offer it, and nothing else, unless someone asks for the desktop app by name; then leave the dev server running and start `npm run dev` in a second terminal.

Vite talks to the same daemon as the DMG (`127.0.0.1:8420`) and the same database (`~/.remy/remy.db`), so threads, workspaces, settings and the token are the real ones. If Remy.app is already running, Vite attaches to that daemon rather than starting a second one.

The page does not live-reload. Refresh it to see a change: editing Remy while watching Remy meant every save yanked the window out from under whatever was on screen.

**UI changes** — Remy.app can stay open; the page is your local `web/` either way.

**Server changes** — quit Remy.app first, then `npm run dev:web`, so the clone's daemon gets port 8420.

Skip `VITE_MC_FIXTURE=1`; that is fake data, not your real state.

## Layout

| Path | What it is |
|---|---|
| `web/` | The UI. React 19, Tailwind v4, [shadcn/ui](https://ui.shadcn.com) New York (Radix) in `web/src/components/ui`, Zustand store in `web/src/state`. |
| `server/` | The daemon. Node and TypeScript, binds `127.0.0.1` only, SQLite at `~/.remy/remy.db` through `node:sqlite`. Threads run on the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) or on Codex — see **Providers**. |
| `desktop/` | The Electron shell (`me.padamchopra.Remy`). Owns the window and the tokens, and ships the `web/` build plus the daemon in the DMG. |
| `ios/` | SwiftUI companion (XcodeGen), still speaking the older session/tmux remote. |
| `deploy/` | Optional launchd login item, Claude and Codex hooks, `tailscale serve`, pairing QR. |
| `.agents/skills/` | House rules. Read the one that covers what you are about to change. |

`web/vite.config.ts` does more than it looks: it spawns the local daemon when none is up, proxies `/api` to it, and injects the bearer token from `~/.remy/remy.db` on each request so the token never reaches the page.

## Skills

`.agents/skills` holds the conventions reviews are held to.

- **`ui`** — layout and keyboard. Every control comes from a shadcn primitive; a custom `div` is the last resort.
- **`content`** — every user-facing string. Second person, present tense, one short sentence.
- **`qa`** — after a visual or interaction change, drive the running app before calling it done.
- **`shadcn`** and **`migrate-radix-to-base`** — vendored from `shadcn/ui` and tracked in `skills-lock.json`. Do not hand-edit them.

## Checks

```sh
npm run typecheck    # web + desktop
npm test             # server: tsc, then node --test on dist/*.test.js
npm run shots        # Playwright PNGs of the window
npm run live-check   # assert the window is showing threads
npm run pack:mac     # web + daemon + Electron DMG → desktop/release/
```

A server module opens its database at import time, so a test that touches state points `MC_CONFIG_DIR` (or `HOME`) at a `mkdtempSync` directory **before** the dynamic `await import(...)` of the module under test — see `server/src/chat-storage.test.ts`. A static import runs first and would open the real `~/.remy/remy.db`. `node:test` gives each file its own process, so the override cannot leak sideways.

## Conventions

- **Comments** explain why, not what, and use `///` on exported declarations. Match the density of the file you are in; the codebase is sparse.
- **No shell strings.** The server reaches `git`, `gh`, and `tmux` through `execFile` with an argument array. Never build a command line, and never interpolate a path or a branch name into one.
- **Loopback only.** The daemon binds `127.0.0.1` behind a bearer token; the way in from another device is `tailscale serve`. Do not widen the bind.
- **Config lives in the database** — the `kv` table in `~/.remy/remy.db`, read through `server/src/config.ts`. A new setting is a key on `Config`, a line in `publicSettings`, and a validated branch in `patchSettings`; the client reads and writes it at `/server/settings`. `~/.mission-control` is the legacy directory, honoured when `~/.remy` is absent.
- **Where the window is lives in the URL**, as a hash route parsed by `web/src/lib/route.ts`. Electron loads the build from `file://`, where a path a server never sees cannot survive a reload, so the hash is what both surfaces agree on.
- **Worktrees** Remy creates go in a `.remy` folder, inside the workspace or under the `worktreeRoot` setting, hidden by a rule in the repo's `.git/info/exclude` — per-clone and never committed, so no tracked `.gitignore` changes. Worktrees already checked out elsewhere are left where they are.
- **A person reads "thread"**, not "chat". The API, the database, and the code still say chat.
- **A provider and a model are one choice.** `server/src/providers.ts` is the only list of what a thread may run on; `config.ts`, `agents.ts` and `chat.ts` validate against it, `GET /server/providers` serves it with what the machine actually has installed, and every picker in the window is `web/src/components/ModelPicker.tsx`. Moving to another provider takes the model to that provider's default rather than keeping one it would refuse.
- **Claude is a session, Codex is a turn.** A Claude thread holds one process across many turns and can stop mid-turn to ask. `codex exec --experimental-json` takes a prompt on stdin, writes JSONL events, and exits — so a Codex thread is a process per turn, resumed by the thread id Codex hands back, and it holds nothing in between. There is nowhere for it to come back and ask, so Remy holds it to a sandbox instead: Ask stays read-only, Accept edits is `workspace-write`, Bypass is `danger-full-access`. Never quietly grant what a person would have been asked about.
- **Pairing lives in the daemon**, in the `peers` table — not in any client, so one pairing serves the desktop app, the browser and the phone. A client reaches a paired machine through `/peers/:id/api/...` on its own daemon, which is the only side holding that machine's token. `GET /server/identity` is how a machine introduces itself; `tailscale serve` is the only way in, so the daemon's bind stays on `127.0.0.1`, and `PATCH /server/identity {exposed}` is the switch for it.
- **Two machines pair by asking, not by carrying a token.** `tailnet.ts` lists your devices from `tailscale status --json` and probes each for Remy — an un-tokened `/health` answers **401**, which is the positive signal. `pairing.ts` then runs the ask: one side shows a six-digit code, a person on the other compares it and allows. `/pair/request` and `/pair/status` are **the only unauthenticated routes** in the daemon, because a machine that has never paired holds no token; they disclose nothing but an opaque request id, change nothing without human approval, are capped and single-use, and are reachable only over your own tailnet. Do not add a third.
- **The board converges, it is not copied.** Peers exchange `board_log` events against a version vector (`versionVector`, `eventsSince`, `mergeRemote` in `board-log.ts`), then replay every `reprojectAll`. A merged event keeps the device and lamport it was written with — those two are its place in the order. One high-water mark per device, never a single cursor: a peer can merge a third machine's older event after you last pulled.
- **Notifications are addressed, not broadcast.** The machine that raises one decides where it goes: `notifySelf` for itself, a `notify` flag per peer. A forwarded notification is always shown by whoever receives it.
- **Commit subjects** are a sentence in the imperative with no prefix or scope tag: "Store chats in SQLite instead of a file each". PRs land squashed with the `(#n)` suffix.
- **Version** is `{major}.{minor}.{run}`, where the run number comes from CI. Do not bump `version` in `package.json` by hand.

## Prerequisites

Node 22.5+ for `node:sqlite`, `git`, `gh` authenticated for pull requests, Claude Code on the machine, and `tmux` for the older session remote. Codex too, if you want threads on it. Tailscale only if another device needs to reach the daemon.
