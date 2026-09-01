import type { Metadata } from "next";
import { ManglerXiPage } from "./ManglerXiPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mangler XI – gjett Norges startellever",
  description: "Daglig fotballquiz: fyll ut Norges startellever fra en historisk landskamp, bokstav for bokstav. Nytt lag hver dag kl. 00:00.",
  alternates: { canonical: "/mangler-xi" },
};

export default function Page() {
  return <ManglerXiPage />;
}
