import { MessagesSquare, Terminal } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Badge } from "~/components/ui/badge";
import { Kbd } from "~/components/ui/kbd";
import type { Chat, Session } from "~/state/types";
import { cn, displayPath } from "~/lib/utils";

/// Everything addressable, behind ⌘K.
///
/// cmdk owns matching, grouping, selection and key handling, so this file is
/// only the data and how a row looks. Groups are ordered so whatever needs a
/// person comes first.
export function Palette({
  open,
  onOpenChange,
  sessions,
  chats,
  sections,
  onOpenSession,
  onOpenSection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: Session[];
  chats: Chat[];
  sections: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  onOpenSession: (name: string) => void;
  onOpenSection: (id: string) => void;
}) {
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  const attention = sessions.filter((s) => s.state === "needs_input");
  const rest = sessions.filter((s) => s.state !== "needs_input");

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search sessions, chats, and commands" />
      <CommandList>
        <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
          No matches. Try a session name, a folder, or a chat title.
        </CommandEmpty>

        {attention.length > 0 && (
          <CommandGroup heading="Needs you">
            {attention.map((session) => (
              <SessionRow key={session.name} session={session} onSelect={run(() => onOpenSession(session.name))} />
            ))}
          </CommandGroup>
        )}

        {rest.length > 0 && (
          <CommandGroup heading="Sessions">
            {rest.map((session) => (
              <SessionRow key={session.name} session={session} onSelect={run(() => onOpenSession(session.name))} />
            ))}
          </CommandGroup>
        )}

        {chats.length > 0 && (
          <CommandGroup heading="Chats">
            {chats.map((chat) => (
              <CommandItem
                key={chat.id}
                value={`${chat.title} ${chat.cwd}`}
                onSelect={run(() => onOpenSection("chats"))}
              >
                <MessagesSquare
                  className={cn("size-4 shrink-0", chat.state === "needs_input" ? "text-warning-foreground" : "text-muted-foreground")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{chat.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{chat.preview ?? displayPath(chat.cwd)}</span>
                </span>
                {chat.state === "needs_input" && <Badge tone="warning">Needs you</Badge>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Go to">
          {sections.map(({ id, label, icon: Icon }) => (
            <CommandItem key={id} value={label} onSelect={run(() => onOpenSection(id))}>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>

      <div className="flex h-10 items-center gap-4 border-t border-border bg-muted px-4">
        <span className="text-xs text-muted-foreground">
          Sessions, chats, and every section of the app
        </span>
        <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd keys={["↑", "↓"]} /> Navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd keys={["↵"]} /> Open
          </span>
          <span className="flex items-center gap-1">
            <Kbd keys={["esc"]} /> Close
          </span>
        </span>
      </div>
    </CommandDialog>
  );
}

function SessionRow({ session, onSelect }: { session: Session; onSelect: () => void }) {
  return (
    <CommandItem value={`${session.name} ${displayPath(session.path)} ${session.command}`} onSelect={onSelect}>
      <Terminal
        className={cn(
          "size-4 shrink-0",
          session.state === "needs_input" && "text-warning-foreground",
          session.state === "working" && "text-info-foreground",
          (session.state === "idle" || session.state === "unknown") && "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{session.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {session.preview ?? displayPath(session.path)}
        </span>
      </span>
      {session.state === "needs_input" && <Badge tone="warning">Needs you</Badge>}
      {session.state === "working" && <Badge tone="info">Working</Badge>}
    </CommandItem>
  );
}
