import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  name: string | null | undefined;
  address: string;
  className?: string;
};

function initialsFor(name: string | null | undefined, address: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "??";
  }
  return address.slice(2, 4).toUpperCase();
}

export function ProfileAvatar({ src, name, address, className }: Props) {
  return (
    <Avatar className={cn("size-10", className)}>
      {src ? <AvatarImage src={src} alt={name ?? address} /> : null}
      <AvatarFallback className="font-mono text-xs">
        {initialsFor(name, address)}
      </AvatarFallback>
    </Avatar>
  );
}
