"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { adsEnabled, ADSENSE_CLIENT } from "@/components/ads/AdSlot";

/**
 * Consent model.
 *  - Strictly necessary storage (game progress, streaks) needs no consent.
 *  - Analytics are cookieless and first-party (daily-rotating hash, no client storage) – no consent needed.
 *  - Advertising: in the EEA Google requires a Google-certified CMP (IAB TCF 2.3) for personalised ads.
 *    NEXT_PUBLIC_CMP=funding-choices loads Google's certified CMP ("Privacy & messaging" in AdSense),
 *    which handles the TCF dialog. The AdSense script is loaded only after the page has mounted and
 *    the CMP is present, so no ad requests fire before the TCF string is available.
 *    Without a CMP, the built-in banner offers a simple choice and ads run in limited/non-personalised mode.
 */
export type ConsentStatus = "pending" | "granted" | "denied" | "not-required";

type Ctx = { status: ConsentStatus; grant: () => void; deny: () => void; reopen: () => void };
const ConsentCtx = createContext<Ctx>({ status: "not-required", grant: () => {}, deny: () => {}, reopen: () => {} });
export const useConsent = () => useContext(ConsentCtx);

const KEY = "tt1:consent";
const CMP = process.env.NEXT_PUBLIC_CMP ?? "";

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConsentStatus>(adsEnabled ? "pending" : "not-required");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!adsEnabled) return;
    if (CMP === "funding-choices") {
      // Google's CMP owns the dialog; we treat "resolved" as when the TCF API reports a decision.
      const w = window as unknown as { __tcfapi?: (cmd: string, v: number, cb: (d: { eventStatus?: string; gdprApplies?: boolean }, ok: boolean) => void) => void };
      const check = () => {
        if (!w.__tcfapi) return false;
        w.__tcfapi("addEventListener", 2, (d, ok) => {
          if (!ok) return;
          if (d.gdprApplies === false) setStatus("not-required");
          else if (d.eventStatus === "tcloaded" || d.eventStatus === "useractioncomplete") setStatus("granted");
        });
        return true;
      };
      if (check()) return;
      const t = window.setInterval(() => check() && window.clearInterval(t), 500);
      return () => window.clearInterval(t);
    }
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "granted" || saved === "denied") setStatus(saved);
      else setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const decide = useCallback((v: "granted" | "denied") => {
    setStatus(v);
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    // Non-personalised ads when denied (only relevant without a certified CMP).
    const w = window as unknown as { adsbygoogle?: { requestNonPersonalizedAds?: number }[] & { requestNonPersonalizedAds?: number } };
    if (w.adsbygoogle) w.adsbygoogle.requestNonPersonalizedAds = v === "denied" ? 1 : 0;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      status,
      grant: () => decide("granted"),
      deny: () => decide("denied"),
      reopen: () => {
        if (CMP === "funding-choices") {
          const w = window as unknown as { googlefc?: { callbackQueue?: { push: (o: { CONSENT_DATA_READY?: () => void }) => void }; showRevocationMessage?: () => void } };
          w.googlefc?.showRevocationMessage?.();
        } else setOpen(true);
      },
    }),
    [status, decide],
  );

  return (
    <ConsentCtx.Provider value={value}>
      {children}
      {adsEnabled && CMP === "funding-choices" && (
        <Script async src={`https://fundingchoicesmessages.google.com/i/${ADSENSE_CLIENT.replace("ca-", "")}?ers=1`} strategy="afterInteractive" />
      )}
      {adsEnabled && (status !== "pending" || CMP === "funding-choices") && (
        <Script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} crossOrigin="anonymous" strategy="afterInteractive" />
      )}
      {open && CMP !== "funding-choices" && (
        <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="fixed inset-x-0 bottom-0 z-50 p-3">
          <div className="card mx-auto max-w-lg p-4">
            <h2 id="consent-title" className="font-display text-xl font-bold">
              Annonser og personvern
            </h2>
            <p className="mt-1 text-sm text-mist">
              Tippetuppen er gratis og finansieres av annonser. Vi bruker ingen sporingskapsler for statistikk. Vil du tillate personlig tilpassede annonser fra Google?{" "}
              <a href="/personvern" className="underline">
                Les mer
              </a>
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-secondary flex-1" onClick={() => decide("denied")}>
                Nei takk
              </button>
              <button className="btn btn-primary flex-1" onClick={() => decide("granted")}>
                Godta
              </button>
            </div>
          </div>
        </div>
      )}
    </ConsentCtx.Provider>
  );
}
