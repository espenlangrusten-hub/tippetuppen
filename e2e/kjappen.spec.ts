import { test, expect, type Page } from "@playwright/test";

// Two browser contexts, because the point of Kjappen is that two people see the same
// round at the same time. One context could never catch a buzzer that works for the
// player who pressed it but not for anyone else.
test("two players share a round, and only the one who buzzed may answer", async ({ browser }, info) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host: Page = await hostCtx.newPage();
  const guest: Page = await guestCtx.newPage();

  await host.goto("/kjappen/");
  await host.getByLabel("Navnet ditt").fill("Vert");
  await host.getByRole("button", { name: "Lag ny runde" }).click();
  const chip = host.locator(".kj-code-chip");
  await expect(chip).toBeVisible({ timeout: 15000 });
  const code = ((await chip.textContent()) ?? "").replace("Kode", "").trim();
  expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ23456789]{4}$/);

  await guest.goto("/kjappen/");
  await guest.getByLabel("Navnet ditt").fill("Gjest");
  await guest.getByLabel("…eller bli med på en kode").fill(code);
  await guest.getByRole("button", { name: "Bli med" }).click();

  // The host sees the guest arrive without reloading.
  await expect(host.locator(".kj-podium-name", { hasText: "Gjest" })).toBeVisible({ timeout: 15000 });
  await expect(guest.getByRole("button", { name: /Start Kjappen/ })).toHaveCount(0);

  await host.getByRole("button", { name: "Start Kjappen" }).click();
  await expect(host.locator(".kj-buzzer")).toBeVisible({ timeout: 15000 });
  await expect(guest.locator(".kj-buzzer")).toBeVisible({ timeout: 15000 });
  // The question is the same on both screens, and no answer is anywhere in the page.
  const question = await host.locator(".kj-bubble p").first().textContent();
  await expect(guest.locator(".kj-bubble p").first()).toHaveText(question ?? "", { timeout: 15000 });

  await guest.locator(".kj-buzzer").click();

  // The guest gets the answer box; the host is told who took it and gets no box.
  await expect(guest.getByLabel("Skriv svaret")).toBeVisible({ timeout: 15000 });
  await expect(host.locator("text=Gjest rakk knappen først.")).toBeVisible({ timeout: 15000 });
  await expect(host.getByLabel("Skriv svaret")).toHaveCount(0);
  await host.screenshot({ path: `e2e/screenshots/kjappen-buzzed-${info.project.name}.png` });

  await guest.getByLabel("Skriv svaret").fill("åpenbart feil svar");
  await guest.getByRole("button", { name: "Send svar" }).click();

  // A wrong answer costs 100, and both screens show it.
  await expect(guest.locator(".kj-podium-score", { hasText: "-100" })).toBeVisible({ timeout: 15000 });
  await expect(host.locator(".kj-podium-score", { hasText: "-100" })).toBeVisible({ timeout: 15000 });

  await hostCtx.close();
  await guestCtx.close();
});
