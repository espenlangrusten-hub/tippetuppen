import type { Metadata } from "next";
import { TodayCards } from "@/components/home/TodayCards";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() { return <TodayCards />; }
