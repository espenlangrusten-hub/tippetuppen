import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManglerXiPage } from "../ManglerXiPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  return { title: `Mangler XI #${number}`, alternates: { canonical: `/mangler-xi/${number}` } };
}

export default async function Page({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  return <ManglerXiPage number={n} />;
}
