import { normalizeName } from "@/lib/names";
import type { z } from "zod";
import type * as S from "./schema";

export type WikiPage = { title: string; url: string; extract: string } | null;

/**
 * Wikipedia's search answers every query with something. A hit only counts as the
 * article we asked for if it shares a real word with the subject - "Sogndal Fotball"
 * may legitimately come back as "Sogndal IL", but not as "Sogndal (kommune)".
 */
export function articleMatchesSubject(title: string, subject: string): boolean {
  const stop = new Set(["fk", "if", "il", "bk", "ff", "ik", "sk", "fotball", "stadion", "arena", "oslo"]);
  const words = (s: string) => normalizeName(s).split(" ").filter((w) => w.length > 2 && !stop.has(w));
  const wanted = words(subject);
  if (!wanted.length) return true;
  const got = new Set(words(title));
  return wanted.some((w) => got.has(w));
}

export type Verdict =
  | { ok: true; note: string; source: z.infer<typeof S.sourceRef> }
  | { ok: false; note: string };

/**
 * Does the article actually say what the question claims? The test is deliberately
 * blunt - every required string has to occur in the article text - because the
 * alternative is parsing prose, and a blunt test that is honest about what it checked
 * beats a clever one that is not. A pass is worth a `single_source`, the same standing
 * as "confirmed in a search excerpt" elsewhere in this dataset; it is not proof of the
 * exact relation, and the note it writes says so.
 */
export type Checkable = { id: string; status: string; sources: unknown[]; notes?: string; verify?: { subject: string; mustMention: string[] } };

export function verdictFor(entry: Checkable, page: WikiPage, today: string): Verdict {
  if (!entry.verify) return { ok: false, note: "Ingen oppslag definert: legg inn verify.subject og verify.mustMention." };
  const { subject, mustMention } = entry.verify;
  if (!page) return { ok: false, note: `Fant ingen artikkel om «${subject}» på Wikipedia.` };

  // Whole words only: a substring test found «20» inside «2006» and «1» almost
  // anywhere, and waved questions through on it.
  const haystack = ` ${normalizeName(page.extract)} `;
  const mentions = (needle: string) => haystack.includes(` ${normalizeName(needle)} `);
  // A bare small number proves nothing even as a whole word: «36» somewhere in an article
  // about Haaland is not «36 goals in 2022/23». Those answers go to a person.
  const bare = mustMention.filter((needle) => /^\d{1,3}$/.test(normalizeName(needle)));
  if (bare.length)
    return { ok: false, note: `Tallet ${bare.map((m) => `«${m}»`).join(" og ")} kan ikke bekreftes med et tekstsøk i «${page.title}». Sjekk svaret for hånd.` };
  const missing = mustMention.filter((needle) => !mentions(needle));
  if (missing.length)
    return { ok: false, note: `Artikkelen «${page.title}» nevner ikke ${missing.map((m) => `«${m}»`).join(" og ")}. Sjekk svaret for hånd.` };

  return {
    ok: true,
    note: `Bekreftet mot «${page.title}».`,
    source: {
      url: page.url,
      title: `${page.title} – Wikipedia`,
      kind: "web",
      accessed: today,
      note: `Artikkelteksten nevner ${mustMention.map((m) => `«${m}»`).join(" og ")}. Automatisk kontroll, ikke lest av et menneske.`,
    },
  };
}

/** Apply a verdict to an entry, leaving everything the verdict does not speak to alone. */
export function applyVerdict<T extends Checkable>(entry: T, verdict: Verdict): T {
  if (!verdict.ok) return { ...entry, notes: verdict.note };
  // The note said what a human still had to check; the source now answers it.
  const next = { ...entry, status: "single_source" as const, sources: [...entry.sources, verdict.source] };
  delete (next as { notes?: string }).notes;
  return next as T;
}

/** The entries a verification run should look at: written from memory, with a lookup defined. */
export function pendingVerification<T extends Checkable>(pool: T[]): T[] {
  return pool.filter((q) => q.status === "recall" && q.verify);
}
