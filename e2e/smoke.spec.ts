import { test, expect } from "@playwright/test";

test.describe("Tippetuppen smoke", () => {
  test("home shows both games and Mangler XI plays end-to-end", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tre spill");
    await page.screenshot({ path: `e2e/screenshots/home-${testInfo.project.name}.png`, fullPage: true });
    await expect(page.getByRole("link", { name: /Spill|Se resultat/ }).first()).toBeVisible();

    await page.goto("/mangler-xi/");
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
  await page.goto("/maalloes/");
  await page.getByRole("button", { name: "Kjør!" }).click({ timeout: 8000 }).catch(() => {});
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await page.screenshot({ path: `e2e/screenshots/mal-question-${testInfo.project.name}.png`, fullPage: true });

  // Fetch the puzzle id from the page's saved state after first interaction; use API to learn one valid answer.
  const input = page.getByRole("combobox", { name: "Ditt svar" });
  await input.fill("solsk");
  await expect(page.getByRole("option", { name: /Solskjær/ })).toBeVisible({ timeout: 10000 });
  await input.fill("");
  // Answers are no longer judged as they are typed - anything is accepted and only
  // resolved on submit - so an unknown string is taken in like any other.
  await input.fill("xyzzy ikke et svar");
  await page.getByRole("button", { name: "Svar", exact: true }).click();
  await expect(page.getByText(/Svar lagt til/).first()).toBeVisible({ timeout: 10000 });

  const puzzleId = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("tt1:progress:maalloes:"));
    return k ? k.replace("tt1:progress:maalloes:", "") : null;
  });
  expect(puzzleId).toBeTruthy();
  const valid = "Rosenborg";
  await input.fill(valid);
  await page.getByRole("button", { name: "Svar", exact: true }).click();
  await expect(page.locator("li", { hasText: valid! }).first()).toBeVisible({ timeout: 10000 });
  // Points stay hidden mid-round, while every entry remains editable.
  await expect(page.getByRole("button", { name: /Endre/ }).first()).toBeVisible();
  await page.screenshot({ path: `e2e/screenshots/mal-review-${testInfo.project.name}.png`, fullPage: true });
  const midRound = await page.request.post(`${process.env.E2E_API_URL ?? "http://localhost:8000/api"}/maalloes/answer`, { data: { puzzleId, text: valid, taken: [] } });
  expect(await midRound.json()).not.toHaveProperty("score");
  // Edit removes the chosen entry and puts it back in the input without spending a slot.
  await page.getByRole("button", { name: /Endre/ }).nth(1).click();
  await expect(input).not.toHaveValue("");
  await page.getByRole("button", { name: "Svar", exact: true }).click();
  // Duplicate is rejected without consuming a slot.
  await input.fill(valid);
  await page.getByRole("button", { name: "Svar", exact: true }).click();
  await expect(page.getByText(/allerede lagt til/)).toBeVisible();
  // Fill the remaining three with junk to finish.
  for (const junk of ["a1", "b2", "c3"]) {
    await input.fill(junk + " tull");
    await page.getByRole("button", { name: "Svar", exact: true }).click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByRole("button", { name: "Send inn fem svar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Del resultatet" })).toHaveCount(0);
  await page.getByRole("button", { name: "Send inn fem svar" }).click();
  await expect(page.getByRole("button", { name: "Del resultatet" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Alle svar, fra sjeldnest/)).toBeVisible();
  // ... and are revealed once all five are in.
  await expect(page.getByRole("button", { name: /Endre/ })).toHaveCount(0);
  await page.screenshot({ path: `e2e/screenshots/mal-result-${testInfo.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "Del resultatet" })).toBeVisible();
});

test("archive and stats pages render", async ({ page }) => {
  await page.goto("/arkiv/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Arkiv");
  await page.goto("/statistikk/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Statistikk");
  await page.goto("/personvern/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Personvern");
});
