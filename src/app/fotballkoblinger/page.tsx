import type { Metadata } from "next";
import { FotballkoblingerGame } from "./FotballkoblingerGame";

export const metadata: Metadata = {
  title: "Fotballkoblinger",
  description: "16 norske fotballnavn. Fire sammenhenger. Finn de fire gruppene i dagens Fotballkoblinger.",
};
export default function FotballkoblingerPage() { return <FotballkoblingerGame />; }
