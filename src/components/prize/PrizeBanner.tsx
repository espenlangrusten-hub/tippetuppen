"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { osloDateKey } from "@/lib/dates";

/** The last Oslo day the announcement is shown: the end of the prize month. */
export const PRIZE_BANNER_UNTIL = "2026-10-31";

/**
 * «Flest poeng i oktober vinner en Tippetuppen-kopp», on the front page and /liga.
 * Decided in the browser after load, so the static page never shows a stale banner.
 */
export function PrizeBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(osloDateKey() <= PRIZE_BANNER_UNTIL), []);
  if (!show) return null;
  return (
    <p className="prize-banner">
      <span aria-hidden="true">🏆</span> <b>Flest poeng i oktober vinner en Tippetuppen-kopp.</b>{" "}
      <Link href="/konkurranse/" className="underline">Se reglene</Link>
    </p>
  );
}
