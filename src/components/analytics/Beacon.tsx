"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getVisitorFlags, setVisitorFlags } from "@/lib/storage";
import { apiBeacon } from "@/lib/api";

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

/** Fire-and-forget, cookieless analytics. The Edge Function derives an anonymous daily visitor hash. */
export function track(p: Payload) {
  if (typeof window === "undefined") return;
  apiBeacon({ ...p, path: window.location.pathname, isNew: isFirstVisit() });
}

export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    track({ name: "page_view" });
  }, [pathname]);
  return null;
}
