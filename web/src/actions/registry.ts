import type { AppAction, AppActionContext } from "@/actions/types";

type ActionModule = { default: AppAction | AppAction[] };

const modules = import.meta.glob<ActionModule>("./*.commands.ts", { eager: true });

const actions = Object.values(modules)
  .flatMap((module) => Array.isArray(module.default) ? module.default : [module.default])
  .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));

const duplicate = actions.find((action, index) => actions.findIndex((entry) => entry.id === action.id) !== index);
if (duplicate) throw new Error(`Duplicate app action: ${duplicate.id}`);

export function availableActions(context: AppActionContext): AppAction[] {
  return actions.filter((action) => action.available?.(context) ?? true);
}

export function actionById(id: string): AppAction | undefined {
  return actions.find((action) => action.id === id);
}
