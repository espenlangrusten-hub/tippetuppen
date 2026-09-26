import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadDataset } from "@/data/load";

const ds = loadDataset();
const starts = new Map<string, number>();
for (const a of ds.appearances) if (a.starter) starts.set(a.playerId, (starts.get(a.playerId) ?? 0) + 1);

describe("én spiller er én identitet, uansett hvordan kilden skrev navnet", () => {
  it("slår sammen fullt navn og kortnavn via registerets alias", () => {
    expect(starts.get("henning-stille-berg")).toBeUndefined();
    expect(starts.get("erling-braut-haaland")).toBeUndefined();
    expect(starts.get("henning-berg")).toBeGreaterThan(90);
  });

  it("har ikke tilbake navnene UEFA viste var feilstavet", () => {
    const dir = path.join(process.cwd(), "data", "source", "matches");
    const names = readdirSync(dir).flatMap((f) => (JSON.parse(readFileSync(path.join(dir, f), "utf8")).lineup as { name: string }[]).map((p) => p.name));
    expect(names).not.toContain("Jan Ove Jakobsen");
    expect(names).not.toContain("Magne Hoset");
    expect(starts.get("jahn-ivar-jakobsen")).toBe(40);
  });

  it("lar brødre og navnebrødre være forskjellige personer", () => {
    for (const id of ["mohammed-abdellaoue", "mostafa-abdellaoue", "marcus-pedersen", "marcus-holmgren-pedersen", "valon-berisha", "veton-berisha"]) expect(starts.get(id)).toBeGreaterThan(0);
  });
});
