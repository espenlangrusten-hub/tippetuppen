import type { Metadata } from "next";
import { MaalloesPage } from "./MaalloesPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Målløs – finn de sjeldneste svarene",
  description: "Daglig quiz om Eliteserien, Tippeligaen og landslaget: fem svar, og jo færre som svarer det samme, jo bedre. Nytt spørsmål hver dag.",
  alternates: { canonical: "/maalloes" },
};

export default function Page() {
  return <MaalloesPage />;
}
