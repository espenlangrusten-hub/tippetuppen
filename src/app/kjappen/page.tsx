import type { Metadata } from "next";
import { KjappenGame } from "./KjappenGame";

// Not linked from anywhere and kept out of the index: this is a test bench, not a
// finished game. It is reachable by URL for whoever is trying it out.
export const metadata: Metadata = {
  title: "Kjappen – test",
  description: "Quizshow for inntil fire spillere. Fem spørsmål om norsk fotball.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KjappenGame />;
}
