import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  Folder,
  GitPullRequest,
  Inbox,
  LayoutGrid,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Terminal,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Kbd } from "~/components/ui/kbd";
import { SectionLabel } from "~/components/ui/section-label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Palette } from "~/components/Palette";
import { fixtureChats, fixtureServers, fixtureSessions } from "~/state/fixture";
import type { Chat, Server, Session, SessionState } from "~/state/types";
import { cn } from "~/lib/utils";

type Section = "inbox" | "command" | "chats" | "workspaces" | "prs" | "loops";

const SECTIONS: { id: Section; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "command", label: "Command center", icon: LayoutGrid },
  { id: "chats", label: "Chats", icon: MessagesSquare },
  { id: "workspaces", label: "Workspaces", icon: Folder },
  { id: "prs", label: "Pull requests", icon: GitPullRequest },
  { id: "loops", label: "Loops", icon: RefreshCw },
];

const STATE_TONE: Record<SessionState, "warning" | "info" | "neutral"> = {
  needs_input: "warning",
  working: "info",
  idle: "neutral",
  unknown: "neutral",
};

const STATE_LABEL: Record<SessionState, string> = {
  needs_input: "Needs you",
  working: "Working",
  idle: "Idle",
  unknown: "Unknown",
};

const useFixture = import.meta.env.VITE_MC_FIXTURE === "1";

export function App() {
  const [section, setSection] = useState<Section>("command");
  const [scope, setScope] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);

  const servers: Server[] = useFixture ? fixtureServers : [];
  const allSessions: Session[] = useFixture ? fixtureSessions : [];
  const chats: Chat[] = useFixture ? fixtureChats : [];

  const sessions = useMemo(
    () => (scope ? allSessions.filter((s) => s.serverId === scope) : allSessions),
    [allSessions, scope],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = sessions.find((s) => s.name === selected) ?? null;
  const needsYou = sessions.filter((s) => s.state === "needs_input").length;
  const working = sessions.filter((s) => s.state === "working").length;
  const scopeServer = servers.find((s) => s.id === scope);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Titlebar. Draggable, with the leading inset clearing the traffic lights. */}
      <header
        className="app-drag flex shrink-0 items-center gap-3 border-b border-border bg-sidebar pr-3"
        style={{ height: "var(--workspace-topbar-height)", paddingLeft: "var(--titlebar-traffic-light-inset)" }}
      >
        <span className="text-sm font-medium">
          {SECTIONS.find((s) => s.id === section)?.label}
        </span>
        <div className="app-no-drag ml-auto flex items-center gap-2">
          <Badge tone={servers.some((s) => s.online) ? "success" : "neutral"} dot>
            {servers.length} device{servers.length === 1 ? "" : "s"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <Search />
            <Kbd keys={["⌘", "K"]} />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className="flex w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
          style={{ padding: "var(--sidebar-content-inset)" }}
        >
          <Popover open={deviceMenuOpen} onOpenChange={setDeviceMenuOpen}>
            <PopoverTrigger asChild>
              <button className="flex h-12 w-full items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    servers.some((s) => s.online) ? "bg-success" : "bg-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {scopeServer?.name ?? "All devices"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {servers.length} device{servers.length === 1 ? "" : "s"} · {allSessions.length} agent
                    {allSessions.length === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[248px]">
              <DeviceRow
                label="All devices"
                detail={`${servers.length} device${servers.length === 1 ? "" : "s"}`}
                selected={scope === null}
                online
                onSelect={() => {
                  setScope(null);
                  setDeviceMenuOpen(false);
                }}
              />
              {servers.map((server) => (
                <DeviceRow
                  key={server.id}
                  label={server.name}
                  detail={`${server.code} · ${allSessions.filter((s) => s.serverId === server.id).length} agents`}
                  selected={scope === server.id}
                  online={server.online}
                  onSelect={() => {
                    setScope(server.id);
                    setDeviceMenuOpen(false);
                  }}
                />
              ))}
              <div className="my-1 h-px bg-border" />
              <button className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
                <Plus className="size-3.5" />
                Add connection
              </button>
            </PopoverContent>
          </Popover>

          <nav className="mt-3 flex flex-col gap-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  section === id
                    ? "bg-sidebar-row-selected font-medium text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-row-hover hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", section === id && "text-primary")} />
                <span className="truncate">{label}</span>
                {id === "inbox" && needsYou > 0 && (
                  <Badge tone="warning" className="ml-auto">
                    {needsYou}
                  </Badge>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-4 mb-1.5">
            <SectionLabel trailing={sessions.length || undefined}>Agents</SectionLabel>
          </div>

          <div className="scrollbar-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {sessions.length === 0 ? (
              <p className="px-1.5 py-2 text-xs text-muted-foreground">No agents running.</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {sessions.map((session) => (
                  <button
                    key={session.name}
                    onClick={() => setSelected(session.name)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none",
                      selected === session.name
                        ? "bg-sidebar-row-selected"
                        : "hover:bg-sidebar-row-hover",
                    )}
                  >
                    <StateDot state={session.state} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">{session.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {session.agent} · {session.workspace}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 border-t border-sidebar-border pt-2">
            <SidebarUtility icon={Terminal} label="Archived chats" />
            <SidebarUtility icon={Search} label="Quick open" onClick={() => setPaletteOpen(true)} />
            <SidebarUtility icon={Settings2} label="Connection settings" />
          </div>
        </aside>

        {/* Content */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-baseline gap-3 border-b border-border px-5 py-4">
            <h1 className="text-xl font-semibold tracking-tight">
              {sessions.length} live agent{sessions.length === 1 ? "" : "s"}
            </h1>
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <span>{needsYou} need you</span>
              <span>{working} active</span>
              <span>{sessions.length - needsYou - working} idle</span>
            </div>
            <Button variant="primary" size="sm">
              <Plus />
              New shell
            </Button>
          </div>

          {sessions.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-2">
                {sessions.map((session) => (
                  <article
                    key={session.name}
                    onClick={() => setSelected(session.name)}
                    className={cn(
                      "cursor-default rounded-xl border border-border bg-card p-3.5 transition-colors",
                      active?.name === session.name ? "border-primary/40" : "hover:bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <StateDot state={session.state} />
                      <h2 className="truncate text-sm font-medium">{session.name}</h2>
                      <Badge tone={STATE_TONE[session.state]}>{STATE_LABEL[session.state]}</Badge>
                      <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
                        {session.path}
                      </span>
                    </div>
                    {session.preview && (
                      <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">
                        {session.preview}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <Palette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        sessions={sessions}
        chats={chats}
        onOpenSession={(name) => {
          setSection("command");
          setSelected(name);
        }}
        onOpenSection={(id) => setSection(id as Section)}
        sections={SECTIONS}
      />
    </div>
  );
}

function StateDot({ state }: { state: SessionState }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        state === "needs_input" && "bg-warning",
        state === "working" && "bg-info",
        (state === "idle" || state === "unknown") && "bg-muted-foreground/60",
      )}
    />
  );
}

function DeviceRow({
  label,
  detail,
  selected,
  online,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  online: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none",
        selected ? "bg-accent" : "hover:bg-accent",
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", online ? "bg-success" : "bg-error")} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", selected && "font-medium")}>{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

function SidebarUtility({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Inbox;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-xs text-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-foreground"
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex size-13 items-center justify-center rounded-full bg-muted">
        <Bot className="size-6 text-muted-foreground" strokeWidth={1.5} />
      </span>
      <div className="max-w-[300px] space-y-1.5">
        <h2 className="text-[15px] font-semibold">No agents running</h2>
        <p className="text-[13px] text-muted-foreground">
          Connect a Mac and launch a shell, and the agents running on it show up here.
        </p>
      </div>
      <Button variant="primary" size="md">
        Add a connection
        <ArrowUpRight />
      </Button>
    </div>
  );
}
