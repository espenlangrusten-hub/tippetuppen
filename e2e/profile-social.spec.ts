import { test, expect } from "@playwright/test";

function uniqueStem(project: string) {
  return ("social-" + project + "-" + Date.now().toString(36)).replace(/[^a-z0-9-]/gi, "").slice(0, 20);
}

test("profile and friend-league flow works end-to-end", async ({ page }, testInfo) => {
  const stem = uniqueStem(testInfo.project.name);
  const owner = stem + "-a";
  const friend = stem + "-b";
  const password = "Tippetuppen-123!";
  const leagueName = "Testgjengen " + testInfo.project.name;

  await page.goto("/profil/#register");
  await expect(page.getByRole("heading", { name: "Min profil" })).toBeVisible();

  await page.getByLabel("Brukernavn").fill(owner);
  await page.getByLabel("Passord").fill(password);
  await page.getByLabel("E-postadresse").fill(owner + "-start@example.test");
  await page.getByRole("button", { name: "Opprett spiller" }).click();

  await expect(page.getByText("Spiller opprettet.")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Profilavatar låses opp ved 2 000 totalpoeng/)).toBeVisible();

  await page.getByLabel("Navn", { exact: true }).fill("Test Spiller");
  await page.getByLabel("E-postadresse", { exact: true }).fill(owner + "@example.test");
  await page.getByRole("button", { name: "Lagre profil" }).click();
  await expect(page.getByText("Profilen er lagret.")).toBeVisible({ timeout: 10000 });

  await page.reload();
  await expect(page.getByLabel("Navn", { exact: true })).toHaveValue("Test Spiller");
  await expect(page.getByLabel("E-postadresse", { exact: true })).toHaveValue(owner + "@example.test");

  // The address can be changed, as above, but not removed.
  await page.getByLabel("E-postadresse", { exact: true }).fill("");
  await page.getByRole("button", { name: "Lagre profil" }).click();
  await expect(page.getByText("E-postadressen kan endres, men ikke fjernes.")).toBeVisible({ timeout: 10000 });

  await page.goto("/liga/");
  await page.getByRole("button", { name: "Venneligaer" }).click();
  await page.getByPlaceholder("F.eks. Monolitten G14").fill(leagueName);
  await page.getByRole("button", { name: "Opprett liga" }).click();

  await expect(page.getByText("Venneliga opprettet. Del koden eller invitasjonslenken med vennene dine.")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();

  const codeNode = page.getByText(/^[A-HJ-NP-Z2-9]{6}$/, { exact: true }).first();
  await expect(codeNode).toBeVisible();
  const code = ((await codeNode.textContent()) ?? "").trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  // Leave the owner account, then follow the same invite flow a real friend gets:
  // invitation -> profile creation -> automatic return to the league join screen.
  await page.goto("/profil/");
  await page.getByRole("button", { name: "Logg ut" }).click();

  await page.goto("/liga/?join=" + code);
  await expect(page.getByText(/Du må ha Tippetuppen-profil/)).toBeVisible();
  await page.getByRole("link", { name: "Opprett profil" }).click();

  await expect(page).toHaveURL(new RegExp("/profil/\\?join=" + code + "#register$"));
  await page.getByLabel("Brukernavn").fill(friend);
  await page.getByLabel("Passord").fill(password);
  await page.getByLabel("E-postadresse").fill(friend + "@example.test");
  await page.getByRole("button", { name: "Opprett spiller" }).click();

  await expect(page).toHaveURL(new RegExp("/liga/\\?join=" + code + "$"), { timeout: 10000 });
  await page.getByRole("button", { name: "Bli med i liga" }).click();

  await expect(page.getByText("Du er med i " + leagueName + ".")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();

  const table = page.locator("table").last();
  await expect(table.getByText(owner, { exact: true })).toBeVisible();
  await expect(table.getByText(friend, { exact: true })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3); // header + two players

  await page.screenshot({
    path: `e2e/screenshots/profile-social-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("an offensive username is refused at registration", async ({ page }) => {
  await page.goto("/profil/#register");
  await page.getByLabel("Brukernavn").fill("Fuuuck_" + Date.now().toString(36).slice(-4));
  await page.getByLabel("Passord").fill("Tippetuppen-123!");
  await page.getByLabel("E-postadresse").fill("fu-" + Date.now().toString(36) + "@example.test");
  await page.getByRole("button", { name: "Opprett spiller" }).click();
  await expect(page.getByText("Det brukernavnet er ikke tillatt. Velg et annet.")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Spiller opprettet.")).toHaveCount(0);
});

test("a new player must give an email address, and not one already in use", async ({ page, request }, info) => {
  const api = process.env.E2E_API_URL ?? "http://localhost:8000/api";
  const stem = uniqueStem(info.project.name) + "-e";
  // The API's own checks run as a visitor of their own, so they do not use up the
  // browser's twelve sign-in attempts per quarter hour that the other specs share.
  const headers = { "user-agent": "tippetuppen-e2e-email-" + info.project.name };
  const register = (data: Record<string, string>) => request.post(`${api}/auth/register`, { headers, data });

  // The browser will not send the form without an address.
  await page.goto("/profil/#register");
  await page.getByLabel("Brukernavn").fill(stem);
  await page.getByLabel("Passord").fill("Tippetuppen-123!");
  await page.getByRole("button", { name: "Opprett spiller" }).click();
  await expect(page.getByLabel("E-postadresse")).toHaveJSProperty("validity.valueMissing", true);
  await expect(page.getByText("Spiller opprettet.")).toHaveCount(0);

  // Nor will the API take one.
  const without = await register({ username: stem, password: "Tippetuppen-123!" });
  expect(without.status()).toBe(400);
  expect(await without.json()).toMatchObject({ ok: false, error: "invalid-email" });

  const first = await register({ username: stem, password: "Tippetuppen-123!", email: stem + "@example.test" });
  expect((await first.json()).user.email).toBe(stem + "@example.test");

  // Addresses are compared without case.
  const again = await register({ username: stem + "2", password: "Tippetuppen-123!", email: stem.toUpperCase() + "@example.test" });
  expect(again.status()).toBe(409);
  expect(await again.json()).toMatchObject({ ok: false, error: "email-taken" });
});
