"use client";
import { useConsent } from "./ConsentProvider";

export function ConsentSettingsButton() {
  const { status, reopen } = useConsent();
  if (status === "not-required") return <p className="text-sm text-fog">Annonser er ikke aktivert på denne siden.</p>;
  return (
    <button type="button" className="btn btn-secondary self-start" onClick={reopen}>
      Endre annonsevalg ({status === "granted" ? "tillatt" : status === "denied" ? "ikke tillatt" : "ikke valgt"})
    </button>
  );
}
