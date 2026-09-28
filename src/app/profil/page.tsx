import type { Metadata } from "next";
import { ProfileScreen } from "@/components/profile/ProfileScreen";

export const metadata: Metadata = {
  title: "Min profil",
  description: "Administrer Tippetuppen-profil, avatar og innlogging.",
  alternates: { canonical: "/profil" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ProfileScreen />;
}
