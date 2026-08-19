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
  | { name: "prs" }
  | { name: "loops" }
  | { name: "settings"; tab: SettingsTab };

export interface AppLocation {
  route: Route;
  /// Which device the lists are scoped to, if not all of them.
  device?: string;
}

const SETTINGS_TABS: SettingsTab[] = ["general", "version-control", "providers", "devices", "archive"];

/// The section a route belongs to, which is what the sidebar highlights.
export function sectionOf(route: Route): "inbox" | "chats" | "workspaces" | "prs" | "loops" {
  if (route.name === "threads") return "chats";
  if (route.name === "settings") return "chats";
  return route.name;
}

export function parseLocation(hash: string): AppLocation {
  const raw = hash.replace(/^#/, "");
  const [path, query] = raw.split("?");
  const device = new URLSearchParams(query ?? "").get("device") ?? undefined;
  const [head, tail] = path.replace(/^\/+/, "").split("/");
  const rest = tail ? decodeURIComponent(tail) : undefined;

  if (head === "inbox") return { route: { name: "inbox" }, device };
  if (head === "workspaces") return { route: { name: "workspaces", workspaceId: rest }, device };
  if (head === "pull-requests") return { route: { name: "prs" }, device };
  if (head === "loops") return { route: { name: "loops" }, device };
  if (head === "settings") {
    const tab = SETTINGS_TABS.includes(rest as SettingsTab) ? (rest as SettingsTab) : "general";
    return { route: { name: "settings", tab }, device };
  }
  // Threads are the front door, so anything unrecognised lands there rather
  // than on a blank screen.
  return { route: { name: "threads", threadId: head === "threads" ? rest : undefined }, device };
}

export function formatLocation({ route, device }: AppLocation): string {
  const path =
    route.name === "threads"
      ? `/threads${route.threadId ? `/${encodeURIComponent(route.threadId)}` : ""}`
      : route.name === "workspaces"
        ? `/workspaces${route.workspaceId ? `/${encodeURIComponent(route.workspaceId)}` : ""}`
        : route.name === "settings"
          ? `/settings/${route.tab}`
          : route.name === "prs"
            ? "/pull-requests"
            : `/${route.name}`;
  return `#${path}${device ? `?device=${encodeURIComponent(device)}` : ""}`;
}
