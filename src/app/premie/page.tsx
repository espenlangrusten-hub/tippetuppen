import type { Metadata } from "next";
import { PrizeClaimScreen } from "@/components/prize/PrizeClaimScreen";

export const metadata: Metadata = {
  title: "Hent premien",
  description: "Fyll inn adressen for premien fra Tippetuppen.",
  alternates: { canonical: "/premie" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PrizeClaimScreen />;
}
