import type { Metadata } from "next";
import { Suspense } from "react";
import { ManglerXiScreen } from "./ManglerXiScreen";
import { GameSkeleton } from "@/components/GameLoader";

export const metadata: Metadata = {
  title: "Mangler XI – gjett Norges startellever",
  description: "Daglig fotballquiz: fyll ut Norges startellever fra en historisk landskamp, bokstav for bokstav. Nytt lag hver dag kl. 00:00.",
  alternates: { canonical: "/mangler-xi" },
};

export default function Page() {
  return (
    <Suspense fallback={<GameSkeleton />}>
      <ManglerXiScreen />
    </Suspense>
  );
}
