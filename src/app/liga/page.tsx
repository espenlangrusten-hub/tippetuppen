import type { Metadata } from "next";
import { LeagueScreen } from "@/components/league/LeagueScreen";

export const metadata: Metadata = { title: "Liga", description: "30-dagers liga for Tippetuppen.", robots: { index: false } };
export default function Page() { return <LeagueScreen />; }
