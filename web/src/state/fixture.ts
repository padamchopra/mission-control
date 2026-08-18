import type { Chat, Server, Session } from "./types";

/// Development fixture.
///
/// The desktop app is judged on how it renders a *populated* window, and a Mac
/// with nothing connected shows three empty columns no matter how good the
/// design is. This exists so the layout can be reviewed against real-shaped
/// content before a server is attached. It is only reachable when
/// `VITE_MC_FIXTURE=1`, never in a packaged build.
export const fixtureServers: Server[] = [
  { id: "mini", name: "Mac mini", url: "http://mini:8787", code: "MINI", online: true },
  { id: "mbp", name: "MacBook Pro", url: "http://mbp:8787", code: "MBP", online: true },
];

export const fixtureSessions: Session[] = [
  {
    name: "mission-control",
    serverId: "mini",
    state: "needs_input",
    path: "~/code/mission-control",
    command: "claude",
    agent: "Claude",
    workspace: "mission-control",
    preview: "Should I convert the remaining mono labels too?",
    lastOutputAt: Date.now() - 30_000,
  },
  {
    name: "phere-guest-tabs",
    serverId: "mini",
    state: "working",
    path: "~/code/phere",
    command: "claude",
    agent: "Claude",
    workspace: "phere",
    preview: "Editing GuestTabsViewModel.kt",
    lastOutputAt: Date.now() - 4_000,
  },
  {
    name: "jupiter-gacha",
    serverId: "mbp",
    state: "working",
    path: "~/code/jupiter-mobile",
    command: "claude",
    agent: "Claude",
    workspace: "jupiter",
    preview: "Running ./gradlew :app:assembleDebug",
    lastOutputAt: Date.now() - 12_000,
  },
  {
    name: "site",
    serverId: "mbp",
    state: "idle",
    path: "~/code/site",
    command: "zsh",
    agent: "Shell",
    workspace: "site",
    lastOutputAt: Date.now() - 3_600_000,
  },
];

export const fixtureChats: Chat[] = [
  {
    id: "c1",
    title: "Port the chat tab",
    cwd: "~/code/mission-control",
    state: "idle",
    model: "opus",
    preview: "Both PRs are open and the stack is linked.",
    updatedAt: Date.now() - 600_000,
  },
  {
    id: "c2",
    title: "SQLite migration notes",
    cwd: "~/code/mission-control/server",
    state: "needs_input",
    model: "sonnet",
    preview: "Approve running the migration against the live database?",
    updatedAt: Date.now() - 120_000,
  },
];
