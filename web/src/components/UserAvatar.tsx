import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AVATAR_SEEDS, avatarArt, seedFor } from "@/lib/avatars";
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
  return <SeedAvatar seed={seedFor(avatar)} className={className} />;
}

/// The generated mark for a seed, or the plain default when there is none.
export function SeedAvatar({ seed, className }: { seed?: string; className?: string }) {
  if (!seed) {
    return (
      <Avatar className={className}>
        <AvatarFallback className="bg-primary/15 text-primary">
          <User className="size-4" />
        </AvatarFallback>
      </Avatar>
    );
  }

  const art = avatarArt(seed);
  return (
    <Avatar className={cn("shrink-0", className)}>
      <svg viewBox="0 0 40 40" className="size-full" aria-hidden="true">
        <rect width="40" height="40" fill={art.background} />
        <circle cx={20 + art.offsetX} cy={14 + art.offsetY} r="11" fill={art.circle} opacity="0.95" />
        <rect
          x="-6"
          y={24 + art.offsetY}
          width="52"
          height="13"
          rx="6.5"
          fill={art.band}
          opacity="0.9"
          transform={`rotate(${art.rotation - 90} 20 30)`}
        />
      </svg>
    </Avatar>
  );
}

export { AVATAR_SEEDS };
