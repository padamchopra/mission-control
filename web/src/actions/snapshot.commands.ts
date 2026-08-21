import { Camera } from "lucide-react";
import { toast } from "sonner";
import { takeSnapshot } from "@/lib/snapshot";
import type { AppAction } from "@/actions/types";

const takeSnapshotAction: AppAction = {
  id: "snapshot.take",
  label: "Take a snapshot",
  keywords: ["screen", "screenshot"],
  group: "Do",
  order: 100,
  icon: Camera,
  run: async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const where = await takeSnapshot();
      toast.success("Took a snapshot.", { description: where });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Try again.";
      if (/denied|dismissed|aborted|NotAllowed/i.test(message)) return;
      toast.error("Couldn't take a snapshot", { description: message });
    }
  },
};

export default takeSnapshotAction;
