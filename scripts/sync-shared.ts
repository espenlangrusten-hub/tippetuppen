/**
 * Copy the dependency-free game logic from src/lib into supabase/functions/_shared,
 * so the Deno Edge Function and the Next app run byte-identical rules.
 *
 *   tsx scripts/sync-shared.ts          # write the copies
 *   tsx scripts/sync-shared.ts --check  # fail if they are out of date (used by tests/CI)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export const SHARED_FILES = ["positions.ts", "names.ts", "tiles.ts", "dates.ts", "pitch.ts"];
const SRC = path.join(process.cwd(), "src", "lib");
const DEST = path.join(process.cwd(), "supabase", "functions", "_shared");

const BANNER = "// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.\n";

export function renderShared(file: string): string {
  return BANNER + readFileSync(path.join(SRC, file), "utf8");
}

export function checkShared(): string[] {
  const stale: string[] = [];
  for (const f of SHARED_FILES) {
    const target = path.join(DEST, f);
    if (!existsSync(target) || readFileSync(target, "utf8") !== renderShared(f)) stale.push(f);
  }
  return stale;
}

if (process.argv[1] && process.argv[1].endsWith("sync-shared.ts")) {
  const check = process.argv.includes("--check");
  if (check) {
    const stale = checkShared();
    if (stale.length) {
      console.error(`Out of date in supabase/functions/_shared: ${stale.join(", ")}. Run \`npm run sync:shared\`.`);
      process.exit(1);
    }
    console.log("Shared logic is in sync.");
  } else {
    mkdirSync(DEST, { recursive: true });
    for (const f of SHARED_FILES) writeFileSync(path.join(DEST, f), renderShared(f));
    console.log(`Synced ${SHARED_FILES.length} files to ${DEST}`);
  }
}
