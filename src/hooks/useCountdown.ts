"use client";
import { useEffect, useState } from "react";
import { msUntilNextOsloMidnight } from "@/lib/dates";

export function useMidnightCountdown() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msUntilNextOsloMidnight());
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);
  if (ms == null) return "";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}t ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}
