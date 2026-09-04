import { test, expect } from "@playwright/test";

// The admin key is only ever pasted in by the operator, never built in; this is the
// dev-stack key from scripts/dev-stack.sh.
const KEY = process.env.E2E_ADMIN_KEY ?? "dev-admin-key-0123456789";

test("admin shows traffic figures behind the key", async ({ page }, info) => {
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Kjør!" }).click({ timeout: 5000 }).catch(() => {});

  // Nothing is visible before a key is supplied.
  await expect(page.getByRole("heading", { name: "Besøk" })).toHaveCount(0);

  await page.locator('input[type="password"]').fill(KEY);
  await page.getByRole("button", { name: "Hent" }).click();

  const besok = page.getByRole("heading", { name: "Besøk" });
  await expect(besok).toBeVisible({ timeout: 10000 });

  const section = page.locator("section", { has: besok });
  for (const label of ["Sidevisninger", "Spill startet", "Spill fullført", "Delinger"]) {
    await expect(section.getByText(label, { exact: true })).toBeVisible();
  }
  // Both games are broken out, and the daily table has at least today.
  await expect(section.getByRole("row").filter({ hasText: "Mangler XI" })).toHaveCount(1);
  await expect(section.getByRole("row").filter({ hasText: "Målløs" })).toHaveCount(1);
  await expect(section.getByText("Siste 30 dager")).toBeVisible();
  await expect(section.getByText(/Besøkskoden byttes hver natt/)).toBeVisible();

  await page.screenshot({ path: `e2e/screenshots/admin-${info.project.name}.png`, fullPage: true });
});

test("a wrong admin key shows an error and no figures", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Kjør!" }).click({ timeout: 5000 }).catch(() => {});
  await page.locator('input[type="password"]').fill("feil-nokkel-0123456789");
  await page.getByRole("button", { name: "Hent" }).click();
  await expect(page.getByText("Feil nøkkel.")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Besøk" })).toHaveCount(0);
});
