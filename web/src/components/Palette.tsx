import type { ComponentType } from "react";
import { Camera, MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { takeSnapshot } from "@/lib/snapshot";
import { displayPath } from "@/lib/path";
import { cn } from "@/lib/utils";
import type { Chat } from "@/state/types";

/// Everything addressable, behind ⌘K.
///
/// cmdk owns matching, grouping, selection and key handling, so this file is
/// only the data and how a row looks. Groups are ordered so whatever needs a
/// person comes first.
export function Palette({
  open,
  onOpenChange,
  chats,
  sections,
  onOpenChat,
  onOpenSection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chats: Chat[];
  sections: { id: string; label: string; icon: ComponentType<{ className?: string }> }[];
  onOpenChat: (id: string) => void;
  onOpenSection: (id: string) => void;
}) {
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  // The palette closes first: it is on screen, and a picture of it is not the
  // picture anyone wanted.
  const snapshot = async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const where = await takeSnapshot();
      toast.success("Took a snapshot.", { description: where });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Try again.";
      // Dismissing the platform's own picker is a decision, not a failure.
      if (/denied|dismissed|aborted|NotAllowed/i.test(message)) return;
      toast.error("Couldn't take a snapshot", { description: message });
    }
  };

  const attention = chats.filter((chat) => chat.state === "needs_input");
  const rest = chats.filter((chat) => chat.state !== "needs_input");

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick open"
      description="Search threads and commands"
      showCloseButton={false}
      className="top-[12%] translate-y-0 sm:max-w-[620px]"
    >
      <CommandInput placeholder="Search threads and commands" />
      <CommandList className="max-h-[380px]">
        <CommandEmpty>No matches. Try a thread title or a folder.</CommandEmpty>

        {attention.length > 0 && (
          <CommandGroup heading="Needs you">
            {attention.map((chat) => (
              <ChatRow key={chat.id} chat={chat} onSelect={run(() => onOpenChat(chat.id))} />
            ))}
          </CommandGroup>
        )}

        {attention.length > 0 && rest.length > 0 && <CommandSeparator />}

        {rest.length > 0 && (
          <CommandGroup heading="Threads">
            {rest.map((chat) => (
              <ChatRow key={chat.id} chat={chat} onSelect={run(() => onOpenChat(chat.id))} />
            ))}
          </CommandGroup>
        )}

        {(attention.length > 0 || rest.length > 0) && <CommandSeparator />}

        <CommandGroup heading="Go to">
          {sections.map(({ id, label, icon: Icon }) => (
            <CommandItem key={id} value={label} onSelect={run(() => onOpenSection(id))}>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Do">
          <CommandItem value="Take a snapshot" onSelect={run(() => void snapshot())}>
            <Camera className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">Take a snapshot</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>

      <Separator />
      <div className="flex h-10 items-center gap-4 bg-muted px-4">
        <span className="text-xs text-muted-foreground">Threads and every section of the app</span>
        <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> Open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> Close
          </span>
        </span>
      </div>
    </CommandDialog>
  );
}

function ChatRow({ chat, onSelect }: { chat: Chat; onSelect: () => void }) {
  return (
    <CommandItem value={`${chat.title} ${displayPath(chat.cwd)}`} onSelect={onSelect}>
      <MessagesSquare
        className={cn(
          "size-4 shrink-0",
          chat.state === "needs_input" && "text-warning-foreground",
          chat.state === "working" && "text-info-foreground",
          chat.state === "error" && "text-destructive",
          chat.state === "idle" && "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{chat.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {chat.preview ?? displayPath(chat.cwd)}
        </span>
      </span>
      {chat.state === "needs_input" && <Badge variant="warning">Needs you</Badge>}
      {chat.state === "working" && <Badge variant="info">Working</Badge>}
    </CommandItem>
  );
}
