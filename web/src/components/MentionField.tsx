import { useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { AssigneeAvatar } from "@/components/TicketGlyphs";
import type { Person } from "@/lib/tickets";
import type { Agent } from "@/state/types";

/// The `@name` being typed, if the caret is inside one.
///
/// Anchored to the start of a word so an email address is left alone, and it
/// stops at whitespace so the menu closes once the name is finished.
const TOKEN = /(?:^|\s)@([\w-]*)$/;

function tokenAt(value: string, caret: number): { query: string; from: number } | undefined {
  const match = TOKEN.exec(value.slice(0, caret));
  if (!match) return undefined;
  return { query: match[1], from: caret - match[1].length - 1 };
}

/// A comment box that knows who Remy has.
///
/// Focus stays in the textarea while the menu is open — you are writing a
/// sentence, not filling in a field — so the arrow keys are forwarded to the
/// list rather than the list taking the caret away.
export function MentionField({
  value,
  onChange,
  people,
  agents,
  onSubmit,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  people: Person[];
  agents: Agent[];
  onSubmit?: () => void;
} & Omit<ComponentProps<typeof Textarea>, "value" | "onChange">) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [token, setToken] = useState<{ query: string; from: number } | undefined>();
  const [active, setActive] = useState("");

  const matches = useMemo(() => {
    if (!token) return [];
    const query = token.query.toLowerCase();
    return people.filter(
      (person) =>
        person.handle.toLowerCase().startsWith(query) || person.name.toLowerCase().startsWith(query),
    );
  }, [people, token]);

  const open = matches.length > 0;

  const read = (element: HTMLTextAreaElement) => {
    const next = tokenAt(element.value, element.selectionStart ?? element.value.length);
    setToken(next);
    if (next?.query !== token?.query) setActive("");
  };

  const pick = (person: Person) => {
    if (!token) return;
    const before = value.slice(0, token.from);
    const after = value.slice(token.from + 1 + token.query.length);
    const inserted = `@${person.handle} `;
    onChange(before + inserted + after);
    setToken(undefined);
    // Put the caret after what was inserted rather than at the end, so a
    // mention in the middle of a sentence does not throw you to the finish.
    const caret = before.length + inserted.length;
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(caret, caret);
    });
  };

  const step = (by: number) => {
    const index = matches.findIndex((person) => person.id === active);
    const next = matches[(index + by + matches.length + (index < 0 ? 1 : 0)) % matches.length];
    if (next) setActive(next.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        return step(1);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        return step(-1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        return setToken(undefined);
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const person = matches.find((entry) => entry.id === active) ?? matches[0];
        event.preventDefault();
        return pick(person);
      }
    }
    // Enter sends; Shift+Enter is a newline, the same as the composer.
    if (event.key !== "Enter" || event.shiftKey || !onSubmit) return;
    event.preventDefault();
    onSubmit();
  };

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <Textarea
          {...rest}
          ref={field}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            read(event.target);
          }}
          onClick={(event) => read(event.currentTarget)}
          onKeyUp={(event) => {
            if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
              read(event.currentTarget);
            }
          }}
          onBlur={() => setToken(undefined)}
          onKeyDown={onKeyDown}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="top"
        className="w-64 p-0"
        // The caret belongs to the textarea the whole time, so the menu must
        // not take focus when it opens or when the pointer leaves it.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false} value={active} onValueChange={setActive}>
          <CommandList>
            <CommandEmpty>Nobody by that name.</CommandEmpty>
            <CommandGroup>
              {matches.map((person) => (
                <CommandItem
                  key={person.id}
                  value={person.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onSelect={() => pick(person)}
                >
                  <AssigneeAvatar assignee={person.id} agents={agents} />
                  <span className="truncate">{person.name}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    @{person.handle}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
