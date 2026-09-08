import { describe, it, expect } from "vitest";
import { loadDataset } from "@/data/load";
import { applyVerdict, articleMatchesSubject, pendingVerification, verdictFor } from "@/data/verify";
import type { StraffesparkQuestion } from "@/data/straffespark";

const entry = (over: Partial<StraffesparkQuestion> = {}): StraffesparkQuestion =>
  ({
    kind: "trivia",
    id: "t1",
    category: "stadion",
    enabled: true,
    prompt: "Hvilken klubb har Alfheim som hjemmebane?",
    answer: { label: "Tromsø", aliases: [] },
    difficulty: 3,
    status: "recall",
    sources: [],
    verify: { subject: "Tromsø IL", mustMention: ["Alfheim"] },
    ...over,
  }) as StraffesparkQuestion;

const page = (extract: string) => ({ title: "Tromsø IL", url: "https://no.wikipedia.org/wiki/Troms%C3%B8_IL", extract });

describe("verifying a question against an article", () => {
  it("promotes an answer the article backs up, and says what it checked", () => {
    const v = verdictFor(entry(), page("Klubben spiller hjemmekampene sine på Alfheim stadion."), "2026-09-08");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.source.url).toContain("wikipedia.org");
    expect(v.source.accessed).toBe("2026-09-08");
    expect(v.source.note).toContain("Alfheim");
    expect(v.source.note).toMatch(/ikke lest av et menneske/);
  });

  it("matches across Norwegian spelling", () => {
    const q = entry({ verify: { subject: "Vålerenga Fotball", mustMention: ["Vålerenga"] } });
    expect(verdictFor(q, page("Valerenga spiller på Intility Arena."), "2026-09-08").ok).toBe(true);
  });

  it("flags rather than rejects when the article does not say it", () => {
    const v = verdictFor(entry(), page("Klubben spiller hjemmekampene sine på Romssa Arena."), "2026-09-08");
    expect(v.ok).toBe(false);
    expect(v.note).toContain("Alfheim");
  });

  it("flags a missing article instead of treating it as a failed answer", () => {
    const v = verdictFor(entry(), null, "2026-09-08");
    expect(v.ok).toBe(false);
    expect(v.note).toContain("Tromsø IL");
  });

  it("requires every needle, not just one", () => {
    const q = entry({ verify: { subject: "Lars Lagerbäck", mustMention: ["Norge", "2017"] } });
    expect(verdictFor(q, page("Lagerbäck ble ansatt i Norge."), "2026-09-08").ok).toBe(false);
    expect(verdictFor(q, page("Lagerbäck overtok Norge i 2017."), "2026-09-08").ok).toBe(true);
  });
});

describe("applying a verdict", () => {
  it("upgrades the status and keeps the source it found", () => {
    const v = verdictFor(entry(), page("Alfheim er hjemmebanen."), "2026-09-08");
    const after = applyVerdict(entry({ notes: "Skrevet fra hukommelsen." }), v);
    expect(after.status).toBe("single_source");
    expect(after.sources).toHaveLength(1);
    expect(after.notes).toBeUndefined();
  });

  it("leaves a failed entry at recall with a note a human can act on", () => {
    const after = applyVerdict(entry(), verdictFor(entry(), null, "2026-09-08"));
    expect(after.status).toBe("recall");
    expect(after.sources).toHaveLength(0);
    expect(after.notes).toContain("Fant ingen artikkel");
  });
});

describe("picking a search hit", () => {
  it("accepts a renamed club article", () => {
    expect(articleMatchesSubject("Sogndal IL", "Sogndal Fotball")).toBe(true);
  });

  it("rejects a hit that only shares boilerplate", () => {
    expect(articleMatchesSubject("Sarpsborg (by)", "Moss FK")).toBe(false);
    expect(articleMatchesSubject("Oslo", "KFUM Oslo")).toBe(false);
  });
});

describe("the queue this run would take", () => {
  const pending = pendingVerification(loadDataset().straffespark);

  it("holds the hand-written questions and nothing else", () => {
    expect(pending.length).toBeGreaterThan(20);
    for (const q of pending) {
      expect(q.status).toBe("recall");
      expect(q.verify?.subject).toBeTruthy();
      expect(q.verify?.mustMention.length).toBeGreaterThan(0);
    }
  });

  it("never queues a question that is already sourced", () => {
    for (const q of pending) expect(q.sources).toHaveLength(0);
  });
});
