import { test, expect } from "@playwright/test";

test("daily Straffespark plays exactly five questions and restarts the same daily round", async ({ page }) => {
  await page.goto("/straffespark/");
  await expect(page.getByText("Dagens runde", { exact: true })).toBeVisible();
  await expect(page.getByText(/Samme spørsmål kommer ikke tilbake før det har gått minst 100 dager/)).toBeVisible();

  const prompts: string[] = [];
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(new RegExp(`Spørsmål ${i + 1} av 5`))).toBeVisible();
    const prompt = ((await page.getByRole("heading", { level: 2 }).textContent()) ?? "").trim();
    expect(prompt.length).toBeGreaterThan(0);
    prompts.push(prompt);

    await expect(page.getByLabel("Ditt svar")).toHaveCount(1);
    await page.getByRole("button", { name: "Hopp over" }).click();
    await expect(page.getByText("Bom!", { exact: true })).toBeVisible();
    await expect(page.getByText("Riktig svar:", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: i === 4 ? "Se resultat" : "Neste spørsmål" }).click();
  }

  expect(new Set(prompts).size).toBe(5);
  await expect(page.getByRole("heading", { name: "Du scoret 0 av 5!" })).toBeVisible();

  await page.getByRole("button", { name: "Spill dagens runde igjen" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(prompts[0]);
});

test("home presents Straffespark as a daily game after Finn spilleren", async ({ page }) => {
  await page.goto("/");
  const cards = await page.getByRole("region", { name: "Dagens spill" }).getByRole("heading", { level: 2 }).allTextContents();
  expect(cards).toHaveLength(4);
  expect(cards.findIndex((s) => s.includes("Finn spilleren"))).toBeGreaterThanOrEqual(0);
  expect(cards.findIndex((s) => s.includes("Straffespark"))).toBeGreaterThan(cards.findIndex((s) => s.includes("Finn spilleren")));
  await expect(page.getByRole("link", { name: "Spill Straffespark, dagens 5", exact: true })).toHaveAttribute("href", /\/straffespark\//);
  await expect(page.getByText("Fem nye spørsmål hver dag.", { exact: true })).toBeVisible();
});
