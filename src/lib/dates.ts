/** Daily puzzle dates are defined in Europe/Oslo local time. */
export const TZ = "Europe/Oslo";

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD for the given instant, in Europe/Oslo. */
export function osloDateKey(d: Date = new Date()): string {
  return fmt.format(d); // en-CA yields ISO-like YYYY-MM-DD
}

export function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Add n days to a date key (calendar arithmetic, DST-safe because keys are calendar dates). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** Milliseconds until the next Oslo midnight, computed by probing the date key. */
export function msUntilNextOsloMidnight(now: Date = new Date()): number {
  const today = osloDateKey(now);
  // Binary search over the next 26 hours for the first instant whose key differs.
  let lo = now.getTime();
  let hi = lo + 26 * 3600 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (osloDateKey(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi - now.getTime();
}

const long = new Intl.DateTimeFormat("nb-NO", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
export function formatDateNo(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return long.format(new Date(Date.UTC(y, m - 1, d, 12)));
}
export function formatShortDateNo(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d}.${m}.${y}`;
}
