import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { DATA_DIR, loadDataset } from "@/data/load";
import type { GeniusPayload, GeniusQuestion } from "@/lib/trener-genius";

const reviewSchema = z.array(z.object({
  sourceId: z.string(), expectedAnswer: z.string(), difficulty: z.number().int().min(1).max(3),
  category: z.string(), distractors: z.array(z.string()).length(3), fact: z.string().min(10),
  reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sources: z.array(z.object({title:z.string(),url:z.string().url()})).min(1),
}));
/** Only the reviewed MC layer is playable. The rest of Claude's bank stays out of rotation. */
export function buildGeniusPuzzles() {
  const bank = loadDataset().coachQuiz;
  const reviews = reviewSchema.parse(JSON.parse(readFileSync(path.join(DATA_DIR, "trener-genius.json"), "utf8")));
  const seen = new Set<string>();
  const pool: GeniusQuestion[] = reviews.map(r => {
    const source = bank.find(q => q.id === r.sourceId);
    if (!source || source.status === "rejected" || source.status === "uncertain" || source.answer.label !== r.expectedAnswer || seen.has(r.sourceId)) throw new Error(`Review is stale or duplicated: ${r.sourceId}`);
    seen.add(r.sourceId);
    const choices = [source.answer.label, ...r.distractors];
    if (new Set(choices.map(s => s.toLocaleLowerCase())).size !== 4) throw new Error(`Duplicate choices: ${r.sourceId}`);
    // Options are shuffled independently of the answer and are identical for every player.
    const options = choices.sort((a,b) => hash(`${source.id}:${a}`).localeCompare(hash(`${source.id}:${b}`)));
    return { id: source.id, coachId: source.coachId, prompt: source.prompt, category: r.category, options,
      answerIndex: options.indexOf(source.answer.label), fact: r.fact, difficulty: r.difficulty, sources: r.sources };
  });
  const rounds: GeniusPayload[] = [];
  // One easy, two medium, one hard; never repeat a coach within the day's four.
  // Consumed questions do not return as synthetic 'new' puzzles.
  while (true) {
    const chosen: GeniusQuestion[] = [];
    for (const level of [1,2,2,3]) {
      const next = pool.find(q => q.difficulty === level && !chosen.some(c => c.coachId === q.coachId));
      if (!next) return rounds.map(toPuzzle);
      chosen.push(next);
      pool.splice(pool.indexOf(next), 1);
    }
    rounds.push({status:"single_source",questions:chosen});
  }
}
function hash(text: string) { return createHash("sha256").update(text).digest("hex"); }
function toPuzzle(payload: GeniusPayload) {
  const signature = payload.questions.map(q => q.id).join("|");
  return { id: `genius-${hash(signature).slice(0,24)}`, game: "trener-genius" as const, kind: "coach-quiz", title: "Trener Genius",
    payload, difficulty: 2, quality: 4, era: null, tags: payload.questions.map(q=>q.coachId), fingerprint: signature, sourceRef: "trener-genius.json" };
}
