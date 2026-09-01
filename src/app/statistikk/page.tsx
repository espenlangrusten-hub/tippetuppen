import type { Metadata } from "next";
import { StatsView } from "@/components/stats/StatsView";
import { osloDateKey } from "@/lib/dates";

export const metadata: Metadata = { title: "Statistikk", description: "Din rekke og dine resultater i Mangler XI og Målløs.", robots: { index: false } };

export default function Page() {
  return <StatsView today={osloDateKey()} />;
}
