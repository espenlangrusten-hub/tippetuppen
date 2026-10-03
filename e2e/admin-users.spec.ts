import { test, expect } from "@playwright/test";

const KEY = process.env.E2E_ADMIN_KEY;
if (!KEY) throw new Error("E2E_ADMIN_KEY must be set for the admin end-to-end tests");

test("admin renames and then deletes a user", async ({ page, context }, info) => {
  const stem = ("adm-" + info.project.name + "-" + Date.now().toString(36)).replace(/[^a-z0-9-]/gi, "").slice(0, 18);
  const renamed = stem + "-x";

  // A real account, created the way a player creates one.
  await page.goto("/profil/#register");
  await page.getByLabel("Brukernavn").fill(stem);
  await page.getByLabel("Passord").fill("Tippetuppen-123!");
  await page.getByRole("button", { name: "Opprett spiller" }).click();
  await expect(page.getByText("Spiller opprettet.")).toBeVisible({ timeout: 10000 });

  // The admin works in another tab of the same browser, so the player stays logged in.
  const admin = await context.newPage();
  await admin.goto("/admin/");
  await admin.getByRole("button", { name: "Kjør!" }).click({ timeout: 5000 }).catch(() => {});
  await admin.locator('input[type="password"]').fill(KEY);
  await admin.getByRole("button", { name: "Hent" }).click();

  const section = admin.locator("section", { has: admin.getByRole("heading", { name: "Brukere" }) });
  await expect(section).toBeVisible({ timeout: 10000 });
  await section.getByLabel("Søk etter bruker").fill(stem);
  await section.getByRole("button", { name: "Søk" }).click();
  const row = section.locator(`li[data-username="${stem}"]`);
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Endre" }).click();
  await section.getByLabel("Brukernavn").fill(renamed);
  await section.getByRole("button", { name: "Lagre" }).click();
  await expect(section.getByRole("status")).toHaveText(`Lagret: ${renamed}.`);

  // The player sees the new name on their next visit to the profile.
  await page.goto("/profil/");
  await expect(page.getByText(renamed).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

  await section.getByLabel("Søk etter bruker").fill(renamed);
  await section.getByRole("button", { name: "Søk" }).click();
  const renamedRow = section.locator(`li[data-username="${renamed}"]`);
  await renamedRow.getByRole("button", { name: "Slett" }).click();
  const confirm = renamedRow.getByRole("button", { name: "Slett for godt" });
  await expect(confirm).toBeDisabled();
  await renamedRow.getByLabel(/for å slette brukeren for godt/).fill(renamed);
  await confirm.click();
  await expect(section.getByRole("status")).toHaveText(`Slettet ${renamed}.`);
  await expect(section.getByText("Ingen brukere funnet.")).toBeVisible();

  // The deleted player's session is gone: the profile page falls back to log in.
  await page.goto("/profil/");
  await expect(page.getByRole("button", { name: "Opprett spiller" }).or(page.getByRole("button", { name: "Logg inn" })).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(renamed)).toHaveCount(0);
});
