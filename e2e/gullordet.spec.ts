import { test, expect } from "@playwright/test";

test("Gullordet accepts a five-letter football guess and survives reload", async ({ page }) => {
  await page.goto("/gullordet/");
  await expect(page.getByRole("heading", { level: 1, name: "Gullordet" })).toBeVisible();
  await expect(page.getByText("Fem bokstaver. Seks forsøk.")).toBeVisible();

  for (const letter of ["B", "R", "A", "N", "N"]) {
    await page.getByRole("button", { name: letter, exact: true }).click();
  }
  await page.getByRole("button", { name: "Send inn", exact: true }).click();

  const first = page.locator('[aria-label^="Forsøk 1:"]');
  await expect(first).toHaveAttribute("aria-label", "Forsøk 1: BRANN", { timeout: 10000 });
  await expect(first.locator("div")).toHaveCount(5);

  await page.reload();
  await expect(page.locator('[aria-label="Forsøk 1: BRANN"]')).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Slik spiller du Gullordet" }).click();
  await expect(page.getByRole("dialog", { name: "Slik spiller du" })).toBeVisible();
  await page.getByRole("button", { name: "Lukk" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
