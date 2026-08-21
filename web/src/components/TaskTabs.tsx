import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/// The two halves of Tasks.
///
/// Recurring tickets are tickets, so they are a view of the same board rather
/// than a section of their own — one place for the work, whether it arrived
/// once or arrives every Monday. Each tab is a route, so a reload lands back on
/// the one you were reading and both carry the same project filter.

export type TaskTab = "board" | "recurring";

export function TaskTabs({ tab, onTab }: { tab: TaskTab; onTab: (tab: TaskTab) => void }) {
  return (
    <Tabs value={tab} onValueChange={(next) => onTab(next as TaskTab)}>
      <TabsList>
        <TabsTrigger value="board">Board</TabsTrigger>
        <TabsTrigger value="recurring">Recurring</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
