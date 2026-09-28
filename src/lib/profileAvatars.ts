import { BASE_PATH } from "@/lib/site";

export const AVATAR_UNLOCK_POINTS = 2000;

export type ProfileAvatarOption = {
  id: number;
  label: string;
  src: string;
};

export const PROFILE_AVATARS: ProfileAvatarOption[] = [
  { id: 1, label: "Kjappen 1", src: BASE_PATH + "/kjappen/avatar-1.webp" },
  { id: 2, label: "Kjappen 2", src: BASE_PATH + "/kjappen/avatar-2.webp" },
  { id: 3, label: "Kjappen 3", src: BASE_PATH + "/kjappen/avatar-3.webp" },
  { id: 4, label: "Kjappen 4", src: BASE_PATH + "/kjappen/avatar-4.webp" },
  { id: 5, label: "Kjappen 5", src: BASE_PATH + "/kjappen/avatar-5.webp" },
  { id: 6, label: "Kjappen 6", src: BASE_PATH + "/kjappen/avatar-6.webp" },
  { id: 7, label: "Karikatur 1", src: BASE_PATH + "/profile/avatar-7.webp" },
  { id: 8, label: "Karikatur 2", src: BASE_PATH + "/profile/avatar-8.webp" },
  { id: 9, label: "Karikatur 3", src: BASE_PATH + "/profile/avatar-9.webp" },
];

export function avatarSrc(id: number | null | undefined) {
  return PROFILE_AVATARS.find((avatar) => avatar.id === id)?.src ?? null;
}
