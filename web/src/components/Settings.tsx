import { Archive, Laptop, Monitor, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import remyMark from "@/assets/remy-mark.png";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditableName } from "@/components/EditableName";
import { IconPicker } from "@/components/IconPicker";
import { DEVICE_ICON_IDS, deviceIcon, type DeviceIconId } from "@/lib/devices";
import { hostLabel, parsePairingLink } from "@/lib/pairing";
import { displayPath } from "@/lib/path";
import { isNewer, type RemyRelease } from "@/lib/release";
import { transport } from "@/lib/transport";
import type { TintId } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Server } from "@/state/types";
import { useEffect, useState } from "react";

export type SettingsTab = "general" | "devices" | "archive";

export const SETTINGS_SECTIONS: {
  id: SettingsTab;
  label: string;
  icon: typeof Monitor;
}[] = [
  { id: "general", label: "General", icon: Monitor },
  { id: "devices", label: "Devices", icon: Laptop },
  { id: "archive", label: "Archived chats", icon: Archive },
];

export function SettingsPane({
  tab,
  release,
}: {
  tab: SettingsTab;
  release: {
    current: string;
    latest?: RemyRelease;
    available: boolean;
    checking: boolean;
    error?: string;
    check: () => Promise<RemyRelease | undefined>;
  };
}) {
  const section = SETTINGS_SECTIONS.find((item) => item.id === tab)!;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline gap-3 border-b border-border px-5 py-4">
        <h1 className="text-xl font-semibold tracking-tight">{section.label}</h1>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6">
          {tab === "devices" ? <DevicesPane /> : tab === "archive" ? <ArchivePane /> : <GeneralPane release={release} />}
        </div>
      </ScrollArea>
    </main>
  );
}

function GeneralPane({
  release,
}: {
  release: {
    current: string;
    latest?: RemyRelease;
    available: boolean;
    checking: boolean;
    error?: string;
    check: () => Promise<RemyRelease | undefined>;
  };
}) {
  const { current, latest, available, checking, check } = release;

  const onCheck = async () => {
    try {
      const next = await check();
      if (!next || !isNewer(next.version, current)) {
        toast.success("You're on the latest version.");
      }
    } catch {
      toast.error("Couldn't check for updates", { description: "Try again in a bit." });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <img src={remyMark} alt="" className="size-10 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Remy</p>
          {available && latest ? (
            <p className="text-xs text-muted-foreground">{latest.version} is ready to install.</p>
          ) : (
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {checking ? <span className="shimmer">Checking…</span> : current}
            </p>
          )}
        </div>
        {available && latest ? (
          <Button asChild size="sm">
            <a href={latest.downloadUrl ?? latest.pageUrl} target="_blank" rel="noreferrer">
              Download {latest.version}
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={checking} onClick={() => void onCheck()}>
            {checking ? "Checking…" : "Check for updates"}
          </Button>
        )}
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border px-3.5 py-3">
        <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Appearance</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Dark is the only theme wired up today.</p>
        </div>
      </div>
    </div>
  );
}

function ArchivePane() {
  const servers = useStore((s) => s.servers);
  const [items, setItems] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const serverKey = servers.map((server) => `${server.id}:${server.online ? "1" : "0"}`).join("|");

  useEffect(() => {
    let cancelled = false;
    const currentServers = useStore.getState().servers;
    setLoading(true);
    void Promise.all(
      currentServers.map(async (server) => {
        if (!server.online) return [];
        try {
          const body = await transport.request<{ archives?: RawArchive[] }>(server.id, "/archives");
          return (body.archives ?? []).map((archive) => toRow(archive, server));
        } catch {
          return [];
        }
      }),
    ).then((listed) => {
      if (cancelled) return;
      setItems(listed.flat().sort((a, b) => b.archivedAt - a.archivedAt));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [serverKey]);

  const remove = async (row: ArchiveRow) => {
    try {
      await transport.request(row.serverId, `/archives/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== row.id || item.serverId !== row.serverId));
      toast.success("Removed the archived chat.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      toast.error("Couldn't remove that archive", { description: message });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground shimmer">Loading archives…</p>;
  }

  if (items.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Archive />
          </EmptyMedia>
          <EmptyTitle>No archived chats</EmptyTitle>
          <EmptyDescription>Archive a finished chat from its conversation when you're done.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((row) => (
        <div key={`${row.serverId}:${row.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{row.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {[row.serverName, row.cwd ? displayPath(row.cwd) : undefined, archivedWhen(row.archivedAt)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove ${row.title}`}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {row.title}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remy deletes the saved copy. The original chat is already gone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void remove(row)}>
                  Remove archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}

interface RawArchive {
  id: string;
  session: string;
  archivedAt: number;
  cwd?: string | null;
  conversation?: { title?: string | null };
}

interface ArchiveRow {
  id: string;
  serverId: string;
  serverName: string;
  title: string;
  cwd?: string | null;
  archivedAt: number;
}

function toRow(archive: RawArchive, server: Server): ArchiveRow {
  return {
    id: archive.id,
    serverId: server.id,
    serverName: server.name,
    title: archive.conversation?.title?.trim() || archive.session,
    cwd: archive.cwd,
    archivedAt: archive.archivedAt,
  };
}

function archivedWhen(at: number): string {
  try {
    return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function DevicesPane() {
  const servers = useStore((s) => s.servers);
  const addServer = useStore((s) => s.addServer);
  const removeServer = useStore((s) => s.removeServer);
  const updateServer = useStore((s) => s.updateServer);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canPair = transport.kind === "electron";

  const submit = async () => {
    const parsed = parsePairingLink(link);
    if (!parsed) {
      setError("Paste a remy://configure link from the setup script.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await addServer(parsed);
      setLink("");
      toast.success("Paired the machine.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      toast.error("Couldn't pair that machine", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await removeServer(id);
      toast.success("Removed the connection.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      toast.error("Couldn't remove that connection", { description: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        {servers.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Starting the local Remy server…
          </p>
        ) : (
          servers.map((server) => (
            <DeviceCard
              key={server.id}
              server={server}
              busy={busy}
              canRemove={canPair && !server.local}
              onRemove={() => void remove(server.id)}
              onUpdate={(patch) => updateServer(server.id, patch)}
            />
          ))
        )}
      </div>

      {canPair && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="pairing-link">Pair another machine</Label>
          <div className="flex gap-2">
            <Input
              id="pairing-link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              placeholder="remy://configure?url=…"
              spellCheck={false}
              disabled={busy}
            />
            <Button onClick={() => void submit()} disabled={busy || !link.trim()}>
              <Plus />
              Add
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function DeviceCard({
  server,
  busy,
  canRemove,
  onRemove,
  onUpdate,
}: {
  server: Server;
  busy: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onUpdate: (patch: { name?: string; icon?: DeviceIconId; tint?: TintId }) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
        <IconPicker
          label={`Change icon for ${server.name}`}
          icon={server.icon}
          tint={server.tint}
          icons={DEVICE_ICON_IDS}
          renderIcon={deviceIcon}
          onChange={(patch) => void onUpdate(patch)}
          badge={
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card",
                server.online ? "bg-success" : "bg-muted-foreground",
              )}
            />
          }
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <EditableName value={server.name} label="device name" onCommit={(name) => void onUpdate({ name })} />
            <Badge variant={server.online ? "success" : "secondary"}>
              {server.online ? "Connected" : "Offline"}
            </Badge>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {server.local ? "This machine" : `${server.code} · ${hostLabel(server.url)}`}
          </span>
        </span>

        {canRemove && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-xs" disabled={busy} aria-label={`Remove ${server.name}`}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {server.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remy stops talking to this machine. Pair it again from a remy:// link.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onRemove}>
                  Remove connection
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {server.online ? <StayAwakeField serverId={server.id} /> : null}
    </div>
  );
}

function StayAwakeField({ serverId }: { serverId: string }) {
  const [mode, setMode] = useState<StayAwakeMode>();
  const [supported, setSupported] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectId = `stay-awake-${serverId}`;

  useEffect(() => {
    let cancelled = false;
    void transport
      .request<{ preventSleep?: string; preventSleepSupported?: boolean }>(serverId, "/server/settings")
      .then((settings) => {
        if (cancelled) return;
        setMode(stayAwakeMode(settings.preventSleep) ?? "off");
        setSupported(settings.preventSleepSupported !== false);
      })
      .catch(() => {
        // Older servers have no settings route; hide the control.
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  if (mode === undefined) return null;

  const disabled = saving || !supported;

  const pick = async (next: string) => {
    const value = stayAwakeMode(next);
    if (!value || value === mode) return;
    const previous = mode;
    setMode(value);
    setSaving(true);
    try {
      await transport.request(serverId, "/server/settings", {
        method: "PATCH",
        body: { preventSleep: value },
      });
    } catch {
      setMode(previous);
      toast.error("Couldn't update that setting", { description: "Try again in a bit." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-3">
      <Field orientation="horizontal" data-disabled={disabled || undefined} className="items-center">
        <FieldContent>
          <FieldLabel htmlFor={selectId}>Stay awake</FieldLabel>
          <FieldDescription>
            {supported ? stayAwakeDetail(mode) : "Sleep prevention isn't available on this machine."}
          </FieldDescription>
        </FieldContent>
        <Select value={mode} onValueChange={(value) => void pick(value)} disabled={disabled}>
          <SelectTrigger id={selectId} size="sm" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {STAY_AWAKE.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

type StayAwakeMode = "off" | "whileBusy" | "always";

const STAY_AWAKE: { value: StayAwakeMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "whileBusy", label: "While working" },
  { value: "always", label: "Always" },
];

function stayAwakeMode(value: unknown): StayAwakeMode | undefined {
  return STAY_AWAKE.some((option) => option.value === value) ? (value as StayAwakeMode) : undefined;
}

function stayAwakeDetail(mode: StayAwakeMode): string {
  if (mode === "whileBusy") {
    return "Stays awake while a chat is running or waiting on you. Closing the lid can still sleep it.";
  }
  if (mode === "always") {
    return "Stays awake until you pick another option or turn the machine off. Closing the lid can still sleep it.";
  }
  return "This machine sleeps as usual.";
}
