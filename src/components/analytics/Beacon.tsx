"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getVisitorFlags, setVisitorFlags } from "@/lib/storage";

export type EventName =
  | "page_view"
  | "game_start"
  | "game_complete"
  | "game_give_up"
  | "share"
  | "archive_open"
  | "second_game_click"
  | "ad_impression";

type Payload = { name: EventName; game?: string; puzzleId?: string; archive?: boolean; props?: Record<string, unknown> };

let firstVisitFlag: boolean | null = null;
function isFirstVisit(): boolean {
  if (firstVisitFlag !== null) return firstVisitFlag;
  const flags = getVisitorFlags();
  if (!flags.firstVisit) {
    setVisitorFlags({ firstVisit: new Date().toISOString() });
    firstVisitFlag = true;
  } else firstVisitFlag = false;
  return firstVisitFlag;
}

/** Fire-and-forget, cookieless analytics. The server derives an anonymous daily visitor hash. */
export function track(p: Payload) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ ...p, path: window.location.pathname, isNew: isFirstVisit() });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    track({ name: "page_view" });
  }, [pathname]);
  return null;
}
