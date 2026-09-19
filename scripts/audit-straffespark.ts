/**
 * Look for Straffespark questions a player would be right to dispute.
 *
 * The bank is hand-written, so the failure modes are editorial rather than structural:
 * two questions with the same answer served in one round, an alias that makes the answer
 * guessable from the prompt, a question whose answer is also a valid answer to another
 * question, or a year claimed in the prompt that the answer contradicts.
 *
 *   node --import tsx scripts/audit-straffespark.ts
 */
import { loadDataset } from "../src/data/load";
import { answerIsSpelledOut, isPlayable } from "../src/data/straffespark";
import { normalizeName } from "../src/lib/names";

const ds = loadDataset();
const pool = ds.straffespark.filter((q) => q.kind === "trivia");
const playable = pool.filter((q) => isPlayable(q));

type Finding = { id: string; why: string; detail: string };
const findings: Finding[] = [];
const note = (id: string, why: string, detail = "") => findings.push({ id, why, detail });

console.log(`Straffespark: ${pool.length} trivia-spørsmål, ${playable.length} spillbare\n`);

// --- Answers that give themselves away -------------------------------------
for (const q of playable) {
  const prompt = normalizeName(q.prompt);
  if (answerIsSpelledOut(q.prompt, q.answer.label)) note(q.id, "svaret står i spørsmålet", `«${q.answer.label}»`);
  for (const alias of q.answer.aliases ?? []) {
    const a = normalizeName(alias);
    // Short aliases like "NM" are words, not giveaways; three or more tokens is a name.
    if (a.length >= 6 && prompt.includes(a)) note(q.id, "et alias står i spørsmålet", `«${alias}»`);
  }
}

// --- Two questions, one answer ---------------------------------------------
const byAnswer = new Map<string, typeof playable>();
for (const q of playable) {
  const k = normalizeName(q.answer.label);
  byAnswer.set(k, [...(byAnswer.get(k) ?? []), q]);
}
for (const [k, qs] of byAnswer) {
  if (qs.length < 2) continue;
  // The same answer twice is fine across a bank of 148; the risk is both landing in one
  // five-question round, which the dealer must avoid.
  note(qs[0].id, `${qs.length} spørsmål deler svaret «${qs[0].answer.label}»`, qs.map((q) => q.id).join(", "));
  void k;
}

// --- Duplicate prompts ------------------------------------------------------
const byPrompt = new Map<string, string[]>();
for (const q of pool) {
  const k = normalizeName(q.prompt);
  byPrompt.set(k, [...(byPrompt.get(k) ?? []), q.id]);
}
for (const [, ids] of byPrompt) if (ids.length > 1) note(ids[0], "identisk spørsmålstekst", ids.join(", "));

// --- An alias that resolves to a different question's answer ----------------
const labels = new Map<string, string>();
for (const q of playable) labels.set(normalizeName(q.answer.label), q.id);
for (const q of playable) {
  for (const alias of q.answer.aliases ?? []) {
    const other = labels.get(normalizeName(alias));
    if (other && other !== q.id) note(q.id, "alias kolliderer med et annet spørsmåls svar", `«${alias}» = ${other}`);
  }
}

// --- Redundant aliases ------------------------------------------------------
for (const q of playable) {
  // Compared raw, not normalised. "Lagerback" beside "Lagerbäck" normalises to the same
  // string but is deliberately there so either spelling is accepted; flagging it was a
  // false positive that would have pushed someone to delete a working alias.
  const seen = new Set<string>();
  for (const alias of q.answer.aliases ?? []) {
    if (normalizeName(alias) === normalizeName(q.answer.label) && alias === q.answer.label)
      note(q.id, "alias er identisk med svaret", `«${alias}»`);
    else if (seen.has(alias)) note(q.id, "samme alias to ganger", `«${alias}»`);
    seen.add(alias);
  }
}

// --- A year in the prompt that nothing backs --------------------------------
for (const q of playable) {
  const years = [...q.prompt.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  for (const y of years) {
    if (y < 1900 || y > new Date().getFullYear() + 1) note(q.id, "urimelig årstall i spørsmålet", String(y));
  }
}

// --- Playable questions must carry a source ---------------------------------
for (const q of playable) {
  if (!q.sources?.length) note(q.id, "spillbart spørsmål uten kilde", q.status);
}

// --- Questions nobody can type ---------------------------------------------
for (const q of playable) {
  if (!q.answer.label.trim()) note(q.id, "tomt svar", "");
  if (q.answer.label.length > 40) note(q.id, "svært langt svar", `${q.answer.label.length} tegn`);
  if (!q.prompt.trim().endsWith("?")) note(q.id, "spørsmål uten spørsmålstegn", q.prompt.slice(-40));
}

const byWhy = new Map<string, Finding[]>();
for (const f of findings) {
  const bucket = f.why.replace(/^\d+/, "N");
  byWhy.set(bucket, [...(byWhy.get(bucket) ?? []), f]);
}
console.log(`Funn: ${findings.length}`);
for (const [bucket, list] of [...byWhy].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n── ${bucket}  (${list.length})`);
  for (const f of list.slice(0, 8)) console.log(`   ${f.id.padEnd(30)} ${f.detail}`);
  if (list.length > 8) console.log(`   … og ${list.length - 8} til`);
}
