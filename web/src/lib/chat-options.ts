import { Box, ListTodo, Lock, Pencil, ShieldOff, Sparkles, type LucideIcon } from "lucide-react";

/// The settings a thread runs under, shared by the composer that starts one and
/// the view of one already running.

export const MODELS = [
  { value: "", label: "Default", icon: Box },
  { value: "opus", label: "Opus", icon: Box },
  { value: "sonnet", label: "Sonnet", icon: Box },
  { value: "haiku", label: "Haiku", icon: Box },
] as const;

export const PERMISSIONS = [
  { value: "default", label: "Ask", icon: Lock },
  { value: "auto", label: "Auto", icon: Sparkles },
  { value: "acceptEdits", label: "Accept edits", icon: Pencil },
  { value: "plan", label: "Plan", icon: ListTodo },
  { value: "bypassPermissions", label: "Bypass", icon: ShieldOff },
] as const;

export type PermissionValue = (typeof PERMISSIONS)[number]["value"];

export function modelLabel(model?: string): string {
  return MODELS.find((entry) => entry.value === (model ?? ""))?.label ?? model ?? "Default";
}

export function permissionOf(value?: string): { label: string; icon: LucideIcon; value: PermissionValue } {
  return PERMISSIONS.find((entry) => entry.value === value) ?? PERMISSIONS[0];
}
