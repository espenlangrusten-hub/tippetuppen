import type { Metadata } from "next";
import "./kjappen-v2.css";
import "./kjappen-type.css";
import "./kjappen-arcade.css";
import "./kjappen-game.css";
import "./kjappen-lobby.css";
import { KjappenGame } from "./KjappenGame";

// Kept out of the index while Kjappen is being polished and tested.
export const metadata: Metadata = {
  title: "Kjappen – test",
  description: "Quizshow for inntil fire spillere. Fem spørsmål om norsk fotball.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KjappenGame />;
}
