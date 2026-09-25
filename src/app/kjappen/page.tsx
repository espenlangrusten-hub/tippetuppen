import type { Metadata } from "next";
import "./kjappen-v2.css";
import "./kjappen-type.css";
import "./kjappen-arcade.css";
import "./kjappen-game.css";
import "./kjappen-lobby.css";
import "./kjappen-responsive.css";
import "./kjappen-host.css";
import { KjappenGame } from "./KjappenGame";

// Out in the open as a beta, but kept out of the index while it is still being polished.
export const metadata: Metadata = {
  title: "Kjappen (beta)",
  description: "Quizshow for inntil fire spillere. Fem spørsmål om norsk fotball.",
  alternates: { canonical: "/kjappen" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KjappenGame />;
}
