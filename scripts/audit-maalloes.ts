/** Run against a seeded local database; does not write puzzles or schedules. */
import { getDbHandle } from "../src/server/db";
import { buildMaalloesPuzzles } from "../src/server/puzzles/maalloes";

const handle = await getDbHandle();
try {
  const generated = await buildMaalloesPuzzles(handle.db);
  const playable = generated.filter((p) => ["verified", "single_source"].includes(p.payload.status));
  console.log(JSON.stringify({
    generated: generated.length,
    playableByStatus: playable.length,
    distinctAnswerSets: new Set(playable.map((p) => p.fingerprint)).size,
    note: "Generator counts, not production schedule or proof of factual verification.",
  }, null, 2));
} finally {
  await handle.close();
}
