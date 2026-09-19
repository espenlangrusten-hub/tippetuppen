/**
 * Read every generated Målløs puzzle out of the database and look for questions that
 * would treat a correct football answer as wrong.
 *
 * Målløs charges 100 points - the maximum - for an answer it cannot resolve, and lower
 * is better. So the thing worth hunting is not a malformed puzzle but a well-formed one
 * whose wording promises a bigger answer set than the data can honour: a player who
 * knows Norwegian football, answers correctly, and is punished for it.
 *
 *   node --import tsx scripts/audit-maalloes.ts [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { getDbHandle } from "../src/server/db";
import type { MaalloesPayload } from "../src/server/puzzles/types";

type Row = { id: string; payload: MaalloesPayload; kind: string; quality: number | null; eligible: boolean; enabled: boolean };

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");

async function main() {
  const handle = await getDbHandle();
  const rows = (await handle.db.execute(
    `select id, payload, kind, quality, eligible, enabled from tippetuppen.puzzles where game='maalloes' order by id`,
  )) as unknown as { rows: Row[] };
  const puzzles = (rows.rows ?? (rows as unknown as Row[])).map((r) => ({
    ...r,
    payload: typeof r.payload === "string" ? (JSON.parse(r.payload) as MaalloesPayload) : r.payload,
  }));

  console.log(`Målløs-oppgaver i basen: ${puzzles.length}\n`);

  const byKind = new Map<string, number>();
  for (const p of puzzles) {
    const kind = p.kind;
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }
  console.log("Per type:");
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  const findings: { id: string; question: string; answers: number; why: string }[] = [];
  const note = (p: (typeof puzzles)[number], why: string) =>
    findings.push({ id: p.id, question: p.payload.question, answers: p.payload.answers.length, why });

  const labels = new Map<string, string[]>();

  for (const p of puzzles) {
    const q = p.payload.question ?? "";
    const answers = p.payload.answers ?? [];

    // The question tells the player the answer set is cut to an invisible dataset.
    if (q.includes("av kampene som er med i spillet")) note(p, "leak: lover et svarrom brukeren ikke kan se");

    // Too few answers to pick five from, or barely more.
    if (answers.length < 5) note(p, `bare ${answers.length} svar, men spillet ber om 5`);
    else if (answers.length < 8) note(p, `bare ${answers.length} svar - nesten alt må gjettes riktig`);

    // Two answers a player cannot tell apart.
    const seen = new Map<string, string>();
    for (const a of answers) {
      const key = a.label.toLowerCase().trim();
      if (seen.has(key) && seen.get(key) !== a.id) note(p, `duplikat svar: «${a.label}»`);
      seen.set(key, a.id);
    }

    // An answer with no aliases can only be hit by typing the label exactly.
    const bare = answers.filter((a) => !a.aliases?.length);
    if (bare.length) note(p, `${bare.length} svar uten aliaser, f.eks. «${bare[0].label}»`);

    // Aliases shared between two different answers make one of them unreachable:
    // resolveAnswer returns null when two rows match and neither is an exact label.
    const alias = new Map<string, string[]>();
    for (const a of answers)
      for (const al of a.aliases ?? []) {
        const k = al.toLowerCase().trim();
        alias.set(k, [...(alias.get(k) ?? []), a.id]);
      }
    for (const [k, ids] of alias)
      if (new Set(ids).size > 1 && !answers.some((a) => a.label.toLowerCase().trim() === k))
        note(p, `aliaset «${k}» peker på ${new Set(ids).size} ulike svar og treffer derfor ingen`);

    // Every puzzle needs exactly one designated zero, and priors must be usable.
    const priors = answers.map((a) => a.prior);
    if (priors.some((x) => typeof x !== "number" || Number.isNaN(x))) note(p, "svar med ugyldig prior");
    if (answers.length && Math.min(...priors) === Math.max(...priors))
      note(p, "alle svar har samme prior - ingen reell rangering");

    for (const a of answers) labels.set(a.label, [...(labels.get(a.label) ?? []), p.id]);
  }

  console.log(`\nFunn: ${findings.length}`);
  const byWhy = new Map<string, typeof findings>();
  for (const f of findings) {
    const bucket = f.why.replace(/\d+/g, "N").replace(/«[^»]*»/g, "«…»");
    byWhy.set(bucket, [...(byWhy.get(bucket) ?? []), f]);
  }
  for (const [bucket, list] of [...byWhy].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n── ${bucket}  (${list.length})`);
    for (const f of list.slice(0, 6)) console.log(`   ${f.id}  [${f.answers} svar]  ${f.question}`);
    if (list.length > 6) console.log(`   … og ${list.length - 6} til`);
  }

  if (jsonAt >= 0) {
    writeFileSync(args[jsonAt + 1], JSON.stringify({ findings, puzzles: puzzles.map((p) => ({ id: p.id, question: p.payload.question, answers: p.payload.answers.map((a) => a.label) })) }, null, 2));
    console.log(`\nSkrev ${args[jsonAt + 1]}`);
  }
  await handle.close();
}

void main();
