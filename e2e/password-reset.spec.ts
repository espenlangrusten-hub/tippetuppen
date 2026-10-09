import { test, expect } from "@playwright/test";

const KEY = process.env.E2E_ADMIN_KEY;
const API = process.env.E2E_API_URL;
if (!KEY || !API) throw new Error("E2E_ADMIN_KEY and E2E_API_URL must be set for the password reset test");

// Five auth attempts in all (register, forgot, reset, reused link, login): the API allows
// twelve per visitor per quarter hour, and the other specs use five.
test("a forgotten password is reset with a one-time link", async ({ page, request }, info) => {
  const stem = ("pw-" + info.project.name + "-" + Date.now().toString(36)).replace(/[^a-z0-9-]/gi, "").slice(0, 18);

  await page.goto("/profil/#register");
  await page.getByLabel("Brukernavn").fill(stem);
  await page.getByLabel("Passord").fill("Gammelt-passord-1");
  await page.getByRole("button", { name: "Opprett spiller" }).click();
  await expect(page.getByText("Spiller opprettet.")).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => localStorage.clear());

  // The request form answers the same for every name, so it reveals nothing.
  await page.goto("/nytt-passord/");
  await page.getByLabel("Brukernavn eller e-post").fill(stem);
  await page.getByRole("button", { name: "Send lenke" }).click();
  await expect(page.getByText(/Har kontoen en e-postadresse, har vi sendt en lenke dit/)).toBeVisible({ timeout: 10000 });

  // This account has no email address, so the admin makes the link.
  const users = await (await request.get(`${API}/admin/users?q=${stem}`, { headers: { "x-admin-key": KEY } })).json();
  const userId = users.users.find((u: { username: string }) => u.username === stem).id as string;
  const made = await (await request.post(`${API}/admin/users/reset-link`, { headers: { "x-admin-key": KEY }, data: { userId } })).json();
  expect(made.ok).toBe(true);
  const fragment = new URL(made.link).hash;
  expect(fragment).toMatch(/^#[a-f0-9]{64}$/);

  await page.goto("/nytt-passord/" + fragment);
  // The token is read and removed from the address bar at once.
  await expect(page).not.toHaveURL(/#/);
  await page.getByLabel("Nytt passord", { exact: true }).fill("Nytt-passord-2");
  await page.getByLabel("Gjenta passordet").fill("Nytt-passord-2");
  await page.getByRole("button", { name: "Lagre nytt passord" }).click();
  await expect(page).toHaveURL(/\/profil\/$/, { timeout: 10000 });
  await expect(page.getByText(stem).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

  // The link works once.
  const again = await (await request.post(`${API}/auth/reset`, { data: { token: fragment.slice(1), password: "Tredje-passord-3" } })).json();
  expect(again).toMatchObject({ ok: false, error: "invalid-link" });

  // The new password logs in; the old one is gone.
  const login = await (await request.post(`${API}/auth/login`, { data: { username: stem, password: "Nytt-passord-2" } })).json();
  expect(login.ok).toBe(true);
});
