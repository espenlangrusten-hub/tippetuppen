import type { Metadata } from "next";
import { Suspense } from "react";
import { GameSkeleton } from "@/components/GameLoader";
import { FinnSpillerenScreen } from "./FinnSpillerenScreen";

export const metadata: Metadata = { title: "Finn spilleren", description: "Finn den norske landslagsspilleren med opptil fem hint." };

export default function Page() {
  return <Suspense fallback={<GameSkeleton />}><FinnSpillerenScreen /></Suspense>;
}
