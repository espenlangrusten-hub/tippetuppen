import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MaalloesPage } from "../MaalloesPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  return { title: `Målløs #${number}`, alternates: { canonical: `/maalloes/${number}` } };
}

export default async function Page({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  return <MaalloesPage number={n} />;
}
