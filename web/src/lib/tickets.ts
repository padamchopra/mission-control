import type { Agent, Chat, Ticket, TicketStatus } from "~/state/types";

/// The board's vocabulary, in one place because the columns, the card menu, the
/// detail pane and the palette all have to agree on it.

export const TICKET_STATUSES: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "needs_input",
  "in_review",
  "done",
  "cancelled",
];

/// The columns a board shows. Cancelled is a status you can set but not a
/// column anyone wants standing in front of them all day.
export const BOARD_COLUMNS: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "needs_input",
  "in_review",
  "done",
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  needs_input: "Needs input",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

/// Which of Remy's tones a status borrows. `needs_input` is the one that has to
/// carry across a room, so it takes the same warning colour the Inbox uses.
export const STATUS_TONE: Record<TicketStatus, string> = {
  backlog: "bg-muted-foreground/50",
  todo: "bg-foreground/70",
  in_progress: "bg-info",
  needs_input: "bg-warning",
  in_review: "bg-primary",
  done: "bg-success",
  cancelled: "bg-muted-foreground/40",
};

export const PRIORITY_LABEL = ["No priority", "Low", "Medium", "High", "Urgent"];

/// Remy sets these two by watching the thread. Everything else is yours, or
/// something an agent declared on purpose — worth saying in the UI so a status
/// that moves on its own does not look like a bug.
export const DERIVED_STATUSES: TicketStatus[] = ["in_progress", "needs_input"];

export function agentFor(agents: Agent[], ticket: Ticket): Agent | undefined {
  return ticket.assigneeAgentId ? agents.find((agent) => agent.id === ticket.assigneeAgentId) : undefined;
}

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

export function ticketsInColumn(tickets: Ticket[], status: TicketStatus): Ticket[] {
  return tickets.filter((ticket) => ticket.status === status).sort(byRank);
}

/// The two neighbours a card lands between when it is moved to `index` of a
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
