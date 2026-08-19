import { Laptop, Monitor, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditableName } from "@/components/EditableName";
import { IconPicker } from "@/components/IconPicker";
import { DEVICE_ICON_IDS, deviceIcon, type DeviceIconId } from "@/lib/devices";
import { hostLabel, parsePairingLink } from "@/lib/pairing";
import { transport } from "@/lib/transport";
import type { TintId } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Server } from "@/state/types";
import { useState } from "react";

export type SettingsTab = "general" | "devices";

export const SETTINGS_SECTIONS: {
  id: SettingsTab;
  label: string;
  icon: typeof Monitor;
}[] = [
  { id: "general", label: "General", icon: Monitor },
  { id: "devices", label: "Devices", icon: Laptop },
];

export function SettingsPane({ tab }: { tab: SettingsTab }) {
  const section = SETTINGS_SECTIONS.find((item) => item.id === tab)!;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline gap-3 border-b border-border px-5 py-4">
        <h1 className="text-xl font-semibold tracking-tight">{section.label}</h1>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6">
          {tab === "devices" ? <DevicesPane /> : <GeneralPane />}
        </div>
      </ScrollArea>
    </main>
  );
}

function GeneralPane() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-lg border border-border px-3.5 py-3">
        <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Appearance</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Dark is the only theme wired up today.</p>
        </div>
      </div>
      <div className="rounded-lg border border-border px-3.5 py-3">
        <p className="text-sm font-medium">Desktop</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {transport.kind === "electron"
            ? "Running in the desktop app. This machine is connected automatically; add others under Devices."
            : "This window talks to the Remy server on this machine. Pair more devices from the desktop app."}
        </p>
      </div>
    </div>
  );
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
      setError(message);
      toast.error("Couldn't remove that connection", { description: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
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
  );
}
