import { test, expect } from "@playwright/test";

test.describe("Tippetuppen smoke", () => {
  test("home shows both games and Mangler XI plays end-to-end", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("To spill");
    await page.screenshot({ path: `e2e/screenshots/home-${testInfo.project.name}.png`, fullPage: true });
    await expect(page.getByRole("link", { name: /Spill|Se resultat/ }).first()).toBeVisible();

    await page.goto("/mangler-xi");
    // Intro modal on first visit
    await page.getByRole("button", { name: "Kjør!" }).click({ timeout: 8000 }).catch(() => {});
    await expect(page.getByText("Trykk på en drakt for å gjette spilleren.")).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/mxi-pitch-${testInfo.project.name}.png`, fullPage: true });

    // Pick the goalkeeper (first shirt in the last row) and make a wrong guess of the right length.
    const shirts = page.getByRole("button", { name: /^Drakt/ });
    const count = await shirts.count();
    expect(count).toBe(11);
    await shirts.last().click();
    await expect(page.getByText(/Forsøk 1\/6/)).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/mxi-panel-${testInfo.project.name}.png` });

    // Read required letter count from the tiles, then type X's via the on-screen keyboard.
    const tiles = page.locator(".tile:not(.tile-space)").filter({ hasNot: page.locator(".tile-correct") });
    const n = await page.evaluate(() => {
      const row = document.querySelector('[aria-label="Ditt forsøk"]');
      return row ? row.querySelectorAll(".tile:not(.tile-space)").length : 0;
    });
    expect(n).toBeGreaterThan(1);
    void tiles;
    for (let i = 0; i < n; i++) await page.getByRole("button", { name: "X", exact: true }).click();
    await page.getByRole("button", { name: "Send inn" }).click();
    await expect(page.getByText(/Forsøk 2\/6/)).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `e2e/screenshots/mxi-guess-${testInfo.project.name}.png` });

    // Give up → result card with share button and second-game CTA.
    await page.getByRole("button", { name: "Gi opp" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Gi opp" }).click();
    await expect(page.getByRole("button", { name: "Del resultatet" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: /Spill Målløs/ })).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/mxi-result-${testInfo.project.name}.png`, fullPage: true });

    // Progress persisted: reload keeps the result.
    await page.reload();
    await expect(page.getByRole("button", { name: "Del resultatet" })).toBeVisible();

    // Home now shows completion state.
    await page.goto("/");
    await expect(page.getByText("Fullført i dag").first()).toBeVisible();
  });
});

test("Målløs plays end-to-end with valid, invalid and duplicate answers", async ({ page }, testInfo) => {
  await page.goto("/maalloes");
  await page.getByRole("button", { name: "Kjør!" }).click({ timeout: 8000 }).catch(() => {});
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await page.screenshot({ path: `e2e/screenshots/mal-question-${testInfo.project.name}.png`, fullPage: true });

  // Fetch the puzzle id from the page's saved state after first interaction; use API to learn one valid answer.
  const input = page.getByRole("textbox", { name: "Ditt svar" });
  await input.fill("xyzzy ikke et svar");
  await page.getByRole("button", { name: "Svar" }).click();
  await expect(page.getByText("Ikke et gyldig svar").first()).toBeVisible({ timeout: 10000 });

  // Pull a valid label via the answer API using the puzzle id stored in localStorage keys.
  const puzzleId = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("tt1:progress:maalloes:"));
    return k ? k.replace("tt1:progress:maalloes:", "") : null;
  });
  expect(puzzleId).toBeTruthy();
  // Try a handful of common Norwegian answers until one is valid.
  const candidates = ["Rosenborg", "Molde", "Brann", "Haaland", "Ødegaard", "Solskjær", "Rekdal", "Egil Olsen", "Viking", "Lillestrøm", "Bratseth", "Sørloth", "Vålerenga", "Bodø/Glimt", "Fjørtoft"];
  let valid: string | null = null;
  for (const c of candidates) {
    const r = await page.request.post("/api/maalloes/answer", { data: { puzzleId, text: c, taken: [] } });
    const j = (await r.json()) as { ok: boolean };
    if (j.ok) {
      valid = c;
      break;
    }
  }
  expect(valid).toBeTruthy();
  await input.fill(valid!);
  await page.getByRole("button", { name: "Svar" }).click();
  await expect(page.locator("li", { hasText: valid! }).first()).toBeVisible({ timeout: 10000 });
  // Duplicate is rejected without consuming a slot.
  await input.fill(valid!);
  await page.getByRole("button", { name: "Svar" }).click();
  await expect(page.getByText(/allerede brukt/)).toBeVisible();
  // Fill the remaining three with junk to finish.
  for (const junk of ["a1", "b2", "c3"]) {
    await input.fill(junk + " tull");
    await page.getByRole("button", { name: "Svar" }).click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByRole("button", { name: "Del resultatet" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Alle svar, fra sjeldnest/)).toBeVisible();
  await page.screenshot({ path: `e2e/screenshots/mal-result-${testInfo.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "Del resultatet" })).toBeVisible();
});

test("archive and stats pages render", async ({ page }) => {
  await page.goto("/arkiv");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Arkiv");
  await page.goto("/statistikk");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Statistikk");
  await page.goto("/personvern");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Personvern");
});
