import type { Metadata } from "next";
import { Suspense } from "react";
import { MaalloesScreen } from "./MaalloesScreen";
import { GameSkeleton } from "@/components/GameLoader";

export const metadata: Metadata = {
  title: "Målløs – finn de sjeldneste svarene",
  description: "Daglig quiz om Eliteserien, Tippeligaen og landslaget: fem svar, og jo færre som svarer det samme, jo bedre. Nytt spørsmål hver dag.",
  alternates: { canonical: "/maalloes" },
};

export default function Page() {
  return (
    <Suspense fallback={<GameSkeleton />}>
      <MaalloesScreen />
    </Suspense>
  );
}
