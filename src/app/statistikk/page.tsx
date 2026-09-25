import type { Metadata } from "next";
import { StatsView } from "@/components/stats/StatsView";
import { osloDateKey } from "@/lib/dates";

export const metadata: Metadata = { title: "Statistikk", description: "Din rekke og dine resultater i de daglige spillene.", alternates: { canonical: "/statistikk" }, robots: { index: false } };

export default function Page() {
  return <StatsView today={osloDateKey()} />;
}
