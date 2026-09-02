"use client";
import { useEffect, useRef } from "react";
import { useConsent } from "@/components/consent/ConsentProvider";
import { ADSENSE_CLIENT, adsEnabled } from "./adsenseConfig";

export { ADSENSE_CLIENT, adsEnabled };

export type AdPlacement = "home-below-games" | "result" | "archive" | "sidebar";

const SLOT_ENV: Record<AdPlacement, string | undefined> = {
  "home-below-games": process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME,
  result: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RESULT,
  archive: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARCHIVE,
  sidebar: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR,
};

/** Reserved heights keep layout stable (no CLS) whether or not an ad fills. */
const SIZE: Record<AdPlacement, { minHeight: number; format: string }> = {
  "home-below-games": { minHeight: 280, format: "auto" },
  result: { minHeight: 250, format: "rectangle" },
  archive: { minHeight: 250, format: "auto" },
  sidebar: { minHeight: 600, format: "vertical" },
};



/**
 * Advertising abstraction. Renders a mock placeholder in development or when
 * AdSense is not configured, and a real AdSense unit in production. Slots are
 * never placed inside the play area; they sit below completed content.
 */
export function AdSlot({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  const ref = useRef<HTMLModElement>(null);
  const { status } = useConsent();
  const slot = SLOT_ENV[placement];
  const live = adsEnabled && !!slot;
  const size = SIZE[placement];

  useEffect(() => {
    if (!live || !ref.current) return;
    if (status === "pending") return; // wait until the CMP has resolved (TCF) before requesting
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* ad blocker or script not loaded */
    }
  }, [live, status]);

  return (
    <div className={`w-full ${className}`} style={{ minHeight: size.minHeight }} data-ad-placement={placement} aria-label="Annonse">
      <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-fog">Annonse</div>
      {live ? (
        <ins
          ref={ref}
          className="adsbygoogle block"
          style={{ display: "block", minHeight: size.minHeight }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format={size.format}
          data-full-width-responsive="true"
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-xl border border-dashed border-line text-xs text-fog"
          style={{ minHeight: size.minHeight - 16 }}
        >
          Annonseplass · {placement}
        </div>
      )}
    </div>
  );
}
