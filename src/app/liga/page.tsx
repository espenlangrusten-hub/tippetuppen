import type { Metadata } from "next";
import { LeagueScreen } from "@/components/league/LeagueScreen";

export const metadata: Metadata = { title: "Liga", description: "Månedens liga: poeng fra de daglige spillene, og den som står øverst når måneden er omme, blir månedens Tippetupp.", alternates: { canonical: "/liga" }, robots: { index: false } };
export default function Page() { return <LeagueScreen />; }
