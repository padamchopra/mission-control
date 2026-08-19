import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AVATAR_PRESETS, presetFor, type AvatarPreset } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

/// Your face, wherever the app shows one.
///
/// Reads the setting rather than taking a prop, so a change in Settings lands
/// everywhere at once.
export function UserAvatar({ className }: { className?: string }) {
  const avatar = useStore((s) => s.settings?.avatar) ?? "";
  return <AvatarFrom avatar={avatar} className={className} />;
}

/// The same face, from a value rather than the setting — for previewing one you
/// have not chosen yet.
export function AvatarFrom({ avatar, className }: { avatar: string; className?: string }) {
  const preset = presetFor(avatar);
  if (avatar.startsWith("data:image/")) {
    return (
      <Avatar className={className}>
        <AvatarImage src={avatar} alt="" />
        <AvatarFallback className="bg-primary/15 text-primary">
          <User className="size-4" />
        </AvatarFallback>
      </Avatar>
    );
  }
  return <PresetAvatar preset={preset} className={className} />;
}

export function PresetAvatar({ preset, className }: { preset?: AvatarPreset; className?: string }) {
  const Icon = preset?.icon ?? User;
  return (
    <Avatar className={className}>
      <AvatarFallback className={cn(preset?.className ?? "bg-primary/15 text-primary")}>
        <Icon className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}

export { AVATAR_PRESETS };
