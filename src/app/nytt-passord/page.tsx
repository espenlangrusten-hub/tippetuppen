import type { Metadata } from "next";
import { PasswordResetScreen } from "@/components/profile/PasswordResetScreen";

export const metadata: Metadata = {
  title: "Nytt passord",
  description: "Be om en lenke for å sette nytt passord på Tippetuppen.",
  alternates: { canonical: "/nytt-passord" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PasswordResetScreen />;
}
