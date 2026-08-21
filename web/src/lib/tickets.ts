import type { Agent, Cadence, Chat, Server, Ticket, TicketStatus } from "~/state/types";

/// The board's vocabulary, in one place because the columns, the card menu, the
/// detail pane and the palette all have to agree on it.

export const TICKET_STATUSES: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "needs_input",
  "pr_review",
  "done",
  "cancelled",
];

/// What an assignee is when the ticket is yours. Mirrors `YOU` in
/// `server/src/tickets.ts`.
export const YOU = "you";

/// The assignee that is not an agent: the workspace's own default model, with
/// no instructions in front of it. Mirrors `WORKSPACE_AGENT` in
/// `server/src/agents.ts`.
export const WORKSPACE_AGENT = "workspace";

/// Everyone a ticket can name — you, the workspace itself, and the agents on
/// this machine. Remy has no accounts, so you are the one person there is.
export interface Person {
  id: string;
  handle: string;
  name: string;
  agent?: Agent;
}

export function people(agents: Agent[]): Person[] {
  return [
    { id: YOU, handle: YOU, name: "You" },
    { id: WORKSPACE_AGENT, handle: WORKSPACE_AGENT, name: "Workspace agent" },
    ...agents.map((agent) => ({ id: agent.id, handle: agent.handle, name: agent.name, agent })),
  ];
}

export const CADENCES: Cadence[] = ["daily", "weekdays", "weekly", "monthly"];

export const CADENCE_LABEL: Record<Cadence, string> = {
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  monthly: "Every month",
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/// A cadence as a sentence: what a person reads on the row rather than four
/// fields they have to assemble themselves.
export function cadenceSummary(recurrence: {
  cadence: Cadence;
  hour: number;
  minute: number;
  weekday?: number;
  day?: number;
}): string {
  const time = clockTime(recurrence.hour, recurrence.minute);
  if (recurrence.cadence === "daily") return `Every day at ${time}`;
  if (recurrence.cadence === "weekdays") return `Every weekday at ${time}`;
  if (recurrence.cadence === "weekly") {
    return `Every ${WEEKDAYS[recurrence.weekday ?? 1]} at ${time}`;
  }
  return `Day ${recurrence.day ?? 1} of the month at ${time}`;
}

/// A time of day in whatever the machine's clock reads as — twelve hours or
/// twenty-four. The date it is hung on is today's, and is never shown.
export function clockTime(hour: number, minute: number): string {
  const at = new Date();
  at.setHours(hour, minute, 0, 0);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/// When the next ticket lands. The time only for today and tomorrow, where it
/// is the thing you want to know — further out the cadence beside it has
/// already said the hour, and repeating it reads as two different facts.
export function whenNext(at: number): string {
  const due = new Date(at);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((due.getTime() - midnight.getTime()) / 86_400_000);
  if (days <= 0) return `today at ${clockTime(due.getHours(), due.getMinutes())}`;
  if (days === 1) return `tomorrow at ${clockTime(due.getHours(), due.getMinutes())}`;
  if (days < 7) return WEEKDAYS[due.getDay()];
  return shortDate(at);
}

/// The machine a ticket runs on. `deviceId` is the durable answer and survives
/// replication; the daemon that happened to answer with the ticket is the
/// fallback for a board written before the field existed.
export function deviceForTicket(
  ticket: { deviceId?: string; serverId: string },
  devices: { deviceId: string; serverId: string }[],
  servers: Server[],
): Server | undefined {
  const match = ticket.deviceId ? devices.find((entry) => entry.deviceId === ticket.deviceId) : undefined;
  return servers.find((server) => server.id === (match ? match.serverId : ticket.serverId));
}

/// The columns a board shows. Cancelled is a status you can set but not a
/// column anyone wants standing in front of them all day.
export const BOARD_COLUMNS: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "needs_input",
  "pr_review",
  "done",
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  needs_input: "Needs input",
  pr_review: "PR Review",
  done: "Done",
  cancelled: "Cancelled",
};

/// Which of Remy's tones a status borrows, as a background and as a foreground.
/// `needs_input` is the one that has to carry across a room, so it takes the
/// same warning colour the Inbox uses.
export const STATUS_TONE: Record<TicketStatus, string> = {
  backlog: "bg-muted-foreground/50",
  todo: "bg-foreground/70",
  in_progress: "bg-info",
  needs_input: "bg-warning",
  pr_review: "bg-primary",
  done: "bg-success",
  cancelled: "bg-muted-foreground/40",
};

export const STATUS_TEXT: Record<TicketStatus, string> = {
  backlog: "text-muted-foreground",
  todo: "text-foreground/70",
  in_progress: "text-info",
  needs_input: "text-warning",
  pr_review: "text-primary",
  done: "text-success",
  cancelled: "text-muted-foreground",
};

/// Remy sets these two by watching the thread. Everything else is yours, or
/// something an agent declared on purpose — worth saying in the UI so a status
/// that moves on its own does not look like a bug.
export const DERIVED_STATUSES: TicketStatus[] = ["in_progress", "needs_input"];

/// The thread a ticket is being worked in right now — the newest one linked to
/// it that still exists on a machine we can see.
export function currentThread(chats: Chat[], ticket: Ticket): Chat | undefined {
  for (const link of [...ticket.threads].reverse()) {
    const chat = chats.find((entry) => entry.id === link.chatId);
    if (chat) return chat;
  }
  return undefined;
}

/// Ranks sort as plain strings, which is the whole point of them.
export function byRank(a: Ticket, b: Ticket): number {
  return a.rank.localeCompare(b.rank) || a.createdAt - b.createdAt;
}

/// A board only shows tickets that are not part of another one — a sub-ticket
/// belongs on its parent, where its progress is already counted.
export function topLevel(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => !ticket.parentId);
}

export function ticketsInColumn(tickets: Ticket[], status: TicketStatus): Ticket[] {
  return topLevel(tickets)
    .filter((ticket) => ticket.status === status)
    .sort(byRank);
}

/// How far through its sub-tickets a ticket is. Cancelled ones are not work
/// anybody still owes, so they count as settled rather than outstanding.
export function subTicketProgress(tickets: Ticket[], ticket: Ticket): { done: number; total: number } {
  const children = tickets.filter((entry) => entry.parentId === ticket.id);
  const done = children.filter((entry) => entry.status === "done" || entry.status === "cancelled").length;
  return { done, total: children.length };
}

/// The two neighbours a card lands between when it is dropped at `index` of a
/// column, so the server can mint one rank rather than renumber the column.
export function neighboursAt(
  tickets: Ticket[],
  status: TicketStatus,
  index: number,
  moving: string,
): { before?: string; after?: string } {
  const column = ticketsInColumn(tickets, status).filter((ticket) => ticket.id !== moving);
  return { before: column[index - 1]?.rank, after: column[index]?.rank };
}

/// A date on a card, short enough to sit under a title. This year needs no year
/// on it; anything older does.
export function shortDate(at: number): string {
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
