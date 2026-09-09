import type { Metadata } from "next";
import { loadDataset } from "@/data/load";
import { isPlayable } from "@/data/straffespark";
import type { BetaQuestion } from "@/lib/straffespark-beta";
import { BetaGame } from "./BetaGame";

export const metadata: Metadata = { title: "Straffespark, 5 kjappe – Beta", description: "Prøv fem kjappe spørsmål om norsk fotball. Ett spørsmål om gangen." };

export default function Page() {
  const ds = loadDataset();
  const ids = ["str-foto-erling-haaland", "str-stadion-21", "str-auto-toppscorer-1992", "str-auto-cup-1994", "str-sang-lillestrom"];
  const questions: BetaQuestion[] = ids.map((id) => {
    const q = ds.straffespark.find((item) => item.id === id);
    if (!q || !isPlayable(q)) throw new Error(`Beta question unavailable: ${id}`);
    if (q.kind === "photo") {
      const player = ds.players.get(q.playerId);
      if (!player) throw new Error(`Missing player: ${q.playerId}`);
      return { id, kind: q.kind, prompt: "Hvem skjuler seg i bildet?", answer: player.displayName, aliases: [player.fullName, player.surname, ...player.aliases.map((a) => a.alias)], media: { ...q.image, file: "shot-1.jpg" }, sources: q.sources };
    }
    return { id, kind: q.kind, prompt: q.prompt, answer: q.answer.label, aliases: q.answer.aliases ?? [], sources: q.sources, ...(q.kind === "chant" ? { media: { ...q.audio, file: "shot-5-20260909.mp3" } } : { fact: q.fact }) };
  });
  return <BetaGame questions={questions} />;
}
