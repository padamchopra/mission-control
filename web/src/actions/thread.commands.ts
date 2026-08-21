import { SquarePen } from "lucide-react";
import type { AppAction } from "@/actions/types";

const startThread: AppAction = {
  id: "thread.start",
  label: "Start new thread",
  keywords: ["new", "chat"],
  group: "Create",
  order: 20,
  icon: SquarePen,
  run: ({ startThread: open }) => open(),
};

export default startThread;
