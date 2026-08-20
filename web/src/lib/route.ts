import type { SettingsTab } from "@/components/Settings";

/// Where the window is, written down so a reload lands back on it.
///
/// The routes live in the hash rather than the path. Electron loads the built
/// app from a `file://` URL, where a path a server never sees cannot survive a
/// reload; a hash is the same string in both places, so the browser and the
/// desktop window agree without either needing a rewrite rule.

export type Route =
  | { name: "inbox" }
  | { name: "threads"; threadId?: string }
  | { name: "workspaces"; workspaceId?: string }
  | { name: "board"; projectId?: string }
  | { name: "ticket"; key: string }
  | { name: "prs" }
  | { name: "loops" }
  | { name: "settings"; tab: SettingsTab };

export interface AppLocation {
  route: Route;
}

const SETTINGS_TABS: SettingsTab[] = [
  "general",
  "version-control",
  "providers",
  "agents",
  "devices",
  "archive",
];

/// The section a route belongs to, which is what the sidebar highlights.
export function sectionOf(route: Route): "inbox" | "chats" | "workspaces" | "prs" | "loops" | "board" {
  if (route.name === "threads") return "chats";
  if (route.name === "settings") return "chats";
  // A ticket sits inside the board the way a thread sits inside Threads.
  if (route.name === "ticket") return "board";
  return route.name;
}

export function parseLocation(hash: string): AppLocation {
  const raw = hash.replace(/^#/, "");
  const [path] = raw.split("?");
  const [head, tail] = path.replace(/^\/+/, "").split("/");
  const rest = tail ? decodeURIComponent(tail) : undefined;

  if (head === "inbox") return { route: { name: "inbox" } };
  if (head === "workspaces") return { route: { name: "workspaces", workspaceId: rest } };
  if (head === "pull-requests") return { route: { name: "prs" } };
  if (head === "loops") return { route: { name: "loops" } };
  if (head === "board") return { route: { name: "board", projectId: rest } };
  // Tickets are addressed by key rather than id, so a link someone pastes reads
  // as the thing it opens.
  if (head === "tickets" && rest) return { route: { name: "ticket", key: rest } };
  if (head === "settings") {
    const tab = SETTINGS_TABS.includes(rest as SettingsTab) ? (rest as SettingsTab) : "general";
    return { route: { name: "settings", tab } };
  }
  // Threads are the front door, so anything unrecognised lands there rather
  // than on a blank screen.
  return { route: { name: "threads", threadId: head === "threads" ? rest : undefined } };
}

export function formatLocation({ route }: AppLocation): string {
  const path =
    route.name === "threads"
      ? `/threads${route.threadId ? `/${encodeURIComponent(route.threadId)}` : ""}`
      : route.name === "workspaces"
        ? `/workspaces${route.workspaceId ? `/${encodeURIComponent(route.workspaceId)}` : ""}`
        : route.name === "board"
          ? `/board${route.projectId ? `/${encodeURIComponent(route.projectId)}` : ""}`
          : route.name === "ticket"
            ? `/tickets/${encodeURIComponent(route.key)}`
            : route.name === "settings"
              ? `/settings/${route.tab}`
              : route.name === "prs"
                ? "/pull-requests"
                : `/${route.name}`;
  return `#${path}`;
}
