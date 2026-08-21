import { FolderPlus } from "lucide-react";
import type { AppAction } from "@/actions/types";

const registerWorkspace: AppAction = {
  id: "workspace.register",
  label: "Register new workspace",
  keywords: ["add", "folder", "repository", "repo"],
  group: "Create",
  order: 30,
  icon: FolderPlus,
  run: ({ registerWorkspace: open }) => open(),
};

export default registerWorkspace;
