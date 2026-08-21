import { createContext, useContext, type ReactNode } from "react";
import { actionById, availableActions } from "@/actions/registry";
import type { AppAction, AppActionContext } from "@/actions/types";

type AppActions = {
  actions: AppAction[];
  run: (id: string) => void | Promise<void>;
};

const ActionsContext = createContext<AppActions | undefined>(undefined);

export function AppActionsProvider({
  context,
  children,
}: {
  context: AppActionContext;
  children: ReactNode;
}) {
  const value: AppActions = {
    actions: availableActions(context),
    run: (id) => {
      const action = actionById(id);
      if (!action || action.available?.(context) === false) return;
      return action.run(context);
    },
  };

  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

export function useAppActions(): AppActions {
  const value = useContext(ActionsContext);
  if (!value) throw new Error("useAppActions must be used inside AppActionsProvider");
  return value;
}
