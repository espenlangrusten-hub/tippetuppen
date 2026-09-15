import { test, expect, type Page } from "@playwright/test";

const join = async (page: Page, code: string, name: string) => {
  await page.goto("/kjappen/");
  await page.getByRole("button", { name: "Tast inn kode" }).click();
  await page.getByLabel("Navnet ditt").fill(name);
  await page.getByLabel("Koden du har fått").fill(code);
  await page.getByRole("button", { name: "Videre" }).click();
};

// Two browser contexts, because the point of Kjappen is that two people see the same
// round at the same time. One context could never catch a buzzer that works for the
// player who pressed it but not for anyone else.
test("two players share a round, and only the one who buzzed may answer", async ({ browser }, info) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host: Page = await hostCtx.newPage();
  const guest: Page = await guestCtx.newPage();

  await host.goto("/kjappen/");
  await host.getByRole("button", { name: "Lag runde" }).click();
  // A button that is simply dead tells you nothing; the first tester met one.
  await host.getByRole("button", { name: "Videre" }).click();
  await expect(host.locator(".kj-error")).toContainText("Skriv navnet ditt", { timeout: 5000 });

  await host.getByLabel("Navnet ditt").fill("Vert");
  await host.getByRole("button", { name: "Videre" }).click();
  const big = host.locator(".kj-code-big");
  await expect(big).toBeVisible({ timeout: 15000 });
  const code = ((await big.textContent()) ?? "").trim();
  expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ23456789]{4}$/);
  await host.getByRole("button", { name: "Videre" }).click();

  await join(guest, code, "Gjest");

  await expect(host.locator(".kj-scoreboard-name", { hasText: "Gjest" })).toBeVisible({ timeout: 15000 });
  await expect(guest.getByRole("button", { name: /Start Kjappen/ })).toHaveCount(0);

  await host.getByRole("button", { name: "Start Kjappen" }).click();
  await expect(host.locator(".kj-buzzer")).toBeVisible({ timeout: 15000 });
  const question = await host.locator(".kj-bubble p").first().textContent();
  await expect(guest.locator(".kj-bubble p").first()).toHaveText(question ?? "", { timeout: 15000 });

  await guest.locator(".kj-buzzer").click();

  // The guest gets the box; everyone watches the same big clock.
  await expect(guest.getByLabel("Skriv svaret")).toBeVisible({ timeout: 15000 });
  await expect(host.locator(".kj-bigclock")).toBeVisible({ timeout: 15000 });
  await expect(guest.locator(".kj-bigclock")).toBeVisible();
  await expect(host.getByLabel("Skriv svaret")).toHaveCount(0);
  await host.screenshot({ path: `e2e/screenshots/kjappen-buzzed-${info.project.name}.png` });

  await guest.getByLabel("Skriv svaret").fill("åpenbart feil svar");
  await guest.getByRole("button", { name: "Send svar" }).click();

  // Verdict across the screen, the answer where the player stands, and the score moved.
  await expect(host.locator(".kj-verdict-wrong")).toBeVisible({ timeout: 15000 });
  await expect(host.locator(".kj-say")).toHaveText("åpenbart feil svar");
  await expect(host.locator(".kj-scoreboard-score", { hasText: "-100" })).toBeVisible();
  // And a bar that says the next question is on its way.
  await expect(host.locator(".kj-sweep")).toBeVisible();

  // The box must be empty on the next question: it used to keep the last answer.
  await expect(guest.locator(".kj-buzzer")).toBeVisible({ timeout: 20000 });
  await guest.locator(".kj-buzzer").click();
  await expect(guest.getByLabel("Skriv svaret")).toHaveValue("", { timeout: 15000 });

  host.on("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: "Avbryt runden" }).click();
  await expect(host.locator(".kj-bubble p").first()).toHaveText("Runden ble avbrutt.", { timeout: 15000 });
  await expect(guest.locator(".kj-bubble p").first()).toHaveText("Runden ble avbrutt.", { timeout: 15000 });
  await expect(guest.getByRole("button", { name: "Avbryt runden" })).toHaveCount(0);

  await hostCtx.close();
  await guestCtx.close();
});
