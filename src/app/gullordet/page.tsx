import type { Metadata } from "next";
import { Suspense } from "react";
import { GameSkeleton } from "@/components/GameLoader";
import { GullordetScreen } from "./GullordetScreen";

export const metadata: Metadata = {
  title: "Gullordet",
  description: "Gjett dagens norske fotballord på seks forsøk.",
  alternates: { canonical: "/gullordet" },
};

export default function Page() {
  return <Suspense fallback={<GameSkeleton />}><GullordetScreen /></Suspense>;
}
