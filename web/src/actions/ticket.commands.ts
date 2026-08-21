import { Plus } from "lucide-react";
import type { AppAction } from "@/actions/types";

const addTicket: AppAction = {
  id: "ticket.add",
  label: "Add ticket",
  keywords: ["new", "task"],
  group: "Create",
  order: 10,
  icon: Plus,
  available: ({ hasProjects }) => hasProjects,
  run: ({ addTicket: open }) => open(),
};

export default addTicket;
