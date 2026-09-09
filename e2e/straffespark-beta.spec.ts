import { test, expect } from "@playwright/test";

test("beta plays exactly five questions, reveals after submission and restarts", async ({ page }) => {
  await page.goto("/straffespark/");
  await page.getByRole("button", { name: "Kjør!" }).click({ timeout: 2000 }).catch(() => {});
  await expect(page.getByText("Beta-versjon", { exact: true })).toBeVisible();
  const answers = ["Haaland", "FK Jerv", "Kaasa", "Molde FK", "kanarifansen"];
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(new RegExp(`Spørsmål ${i + 1} av 5`))).toBeVisible();
    await expect(page.getByLabel("Ditt svar")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Skyt!" })).toBeDisabled();
    await page.getByLabel("Ditt svar").fill(answers[i]);
    await expect(page.getByText("Riktig svar:", { exact: false })).toHaveCount(0);
    if (i === 0) {
      const photo = page.getByRole("img", { name: "Uskarpt bilde av en fotballspiller" });
      await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
    if (i === 4) {
      const audio = page.locator("audio");
      const response = await page.request.get((await audio.getAttribute("src"))!);
      expect(response.ok()).toBe(true);
    }
    await page.getByRole("button", { name: "Skyt!" }).click();
    await expect(page.getByText("⚽ Mål!", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Ditt svar")).toHaveCount(0);
    await page.getByRole("button", { name: i === 4 ? "Se resultat" : "Neste spørsmål" }).click();
  }
  await expect(page.getByRole("heading", { name: "Du scoret 5 av 5!" })).toBeVisible();
  await page.getByRole("button", { name: "Spill testrunden igjen" }).click();
  await page.getByRole("button", { name: "Hopp over" }).click();
  await expect(page.getByText("Bom!", { exact: true })).toBeVisible();
});

test("home has the beta after Finn spilleren", async ({ page }) => {
  await page.goto("/");
  const cards = await page.getByRole("region", { name: "Dagens spill" }).getByRole("heading", { level: 2 }).allTextContents();
  expect(cards).toHaveLength(4);
  expect(cards.findIndex((s) => s.includes("Finn spilleren"))).toBeGreaterThanOrEqual(0);
  expect(cards.findIndex((s) => s.includes("Straffespark"))).toBeGreaterThan(cards.findIndex((s) => s.includes("Finn spilleren")));
  await expect(page.getByRole("link", { name: "Prøv Straffespark, 5 kjappe – beta", exact: true })).toHaveAttribute("href", /\/straffespark\//);
});
