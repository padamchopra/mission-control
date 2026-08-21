import type { TicketStatus } from "../state/types";

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
