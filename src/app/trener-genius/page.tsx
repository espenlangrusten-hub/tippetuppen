import type { Metadata } from "next";
import { TrenerGeniusGame } from "./TrenerGeniusGame";
export const metadata: Metadata = { title: "Trener Genius", description: "Fire spørsmål om trenerne i norsk fotball. Ta plass på benken og velg når du vil gå offensivt.", alternates: { canonical: "/trener-genius" } };
export default function TrenerGeniusPage() { return <TrenerGeniusGame />; }
