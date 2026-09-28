import Image from "next/image";
import { avatarSrc } from "@/lib/profileAvatars";

export function ProfileAvatar({
  avatarId,
  size = 42,
  className = "",
}: {
  avatarId?: number | null;
  size?: number;
  className?: string;
}) {
  const src = avatarSrc(avatarId);
  return (
    <span
      className={"inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-pitch/50 " + className}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src ? (
        <Image src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: Math.max(16, Math.round(size * 0.45)) }}>⚽</span>
      )}
    </span>
  );
}
