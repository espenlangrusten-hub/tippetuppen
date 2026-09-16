import { test, expect, type Page } from "@playwright/test";

const join = async (page: Page, code: string, name: string) => {
  await page.goto("/kjappen/");
  await page.getByRole("button", { name: "Tast inn kode" }).click();
  await page.getByLabel("Navnet ditt").fill(name);
  await page.getByLabel("Koden du har fått").fill(code);
  await page.getByRole("button", { name: "Videre" }).click();
};

/** Which portrait each podium is showing, left to right. */
const faces = (page: Page) =>
  page.locator(".kj-booth img").evaluateAll((els) =>
    els.map((el) => (el.getAttribute("src") ?? "").match(/avatar-(\d+)/)?.[1] ?? "?"),
  );

// Two browser contexts, because the point of Kjappen is that two people see the same
// round at the same time. One context could never catch a buzzer that works for the
// player who pressed it but not for anyone else - nor two screens disagreeing about
// which face belongs to which player.
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
  // Straight into the lobby: the code is handed over there, not on a screen of its own.
  const big = host.locator(".kj-code-big");
  await expect(big).toBeVisible({ timeout: 15000 });
  const code = ((await big.textContent()) ?? "").trim();
  expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ23456789]{4}$/);
  // The red button runs the show, so in the lobby it is the one that starts it - and
  // it says it is waiting until there is somebody to start with.
  await expect(host.getByRole("button", { name: "VENTER" })).toBeVisible();

  await join(guest, code, "Gjest");

  await expect(host.locator(".kj-podium-name", { hasText: "Gjest" })).toBeVisible({ timeout: 15000 });
  // Only the player who made the round may start it.
  await expect(host.getByRole("button", { name: "START!" })).toBeVisible({ timeout: 15000 });
  await expect(guest.getByRole("button", { name: "START!" })).toHaveCount(0);

  // The server deals the portraits, so both screens have to agree on who is who, and
  // two players must never be handed the same face.
  const hostFaces = await faces(host);
  const guestFaces = await faces(guest);
  expect(hostFaces).toEqual(guestFaces);
  expect(new Set(hostFaces).size).toBe(hostFaces.length);
  expect(hostFaces).not.toContain("?");

  await host.getByRole("button", { name: "START!" }).click();

  // Wait for the round to be on a question before reading the board. The board is the
  // same element in the lobby, where it carries "Del koden ... med de andre", so
  // waiting for it to be visible proves nothing and reads whatever is there - which is
  // the lobby text until the phase actually turns over.
  await expect(host.locator(".kj-shell-question")).toHaveCount(1, { timeout: 15000 });
  await expect(guest.locator(".kj-shell-question")).toHaveCount(1, { timeout: 15000 });

  // The question is on the board, and both players read the same one.
  const question = ((await host.locator(".kj-board-question").textContent()) ?? "").trim();
  expect(question.length).toBeGreaterThan(0);
  expect(question).not.toContain("Del koden");
  await expect(guest.locator(".kj-board-question")).toHaveText(question, { timeout: 15000 });
  await expect(host.getByRole("button", { name: "TRYKK HER!" })).toBeVisible();

  await guest.getByRole("button", { name: "TRYKK HER!" }).click();

  // The guest gets the box; everyone watches the same clock, and the guest's podium
  // is the lit one on both screens.
  await expect(guest.getByLabel("Skriv svaret")).toBeVisible({ timeout: 15000 });
  await expect(host.locator(".kj-clock")).toBeVisible({ timeout: 15000 });
  await expect(guest.locator(".kj-clock")).toBeVisible();
  await expect(host.getByLabel("Skriv svaret")).toHaveCount(0);
  await expect(host.locator(".kj-contestant-buzzed")).toHaveCount(1);
  await expect(guest.locator(".kj-contestant-buzzed")).toHaveCount(1);
  await host.screenshot({ path: `e2e/screenshots/kjappen-buzzed-${info.project.name}.png` });

  await guest.getByLabel("Skriv svaret").fill("åpenbart feil svar");
  await guest.getByRole("button", { name: "Send svar" }).click();

  // Verdict across the screen, the answer where the player stands, and the score moved.
  await expect(host.locator(".kj-verdict-wrong")).toBeVisible({ timeout: 15000 });
  await expect(host.locator(".kj-said")).toHaveText("åpenbart feil svar");
  await expect(host.locator(".kj-podium-score", { hasText: "-100" })).toBeVisible();
  // And a bar that says the next question is on its way.
  await expect(host.locator(".kj-sweep")).toBeVisible();

  // The box must be empty on the next question: it used to keep the last answer.
  await expect(guest.getByRole("button", { name: "TRYKK HER!" })).toBeEnabled({ timeout: 20000 });
  await guest.getByRole("button", { name: "TRYKK HER!" }).click();
  await expect(guest.getByLabel("Skriv svaret")).toHaveValue("", { timeout: 15000 });
  // The face a player was dealt survives the round rather than being redrawn per question.
  expect(await faces(guest)).toEqual(guestFaces);

  host.on("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: "Avbryt runden" }).click();
  await expect(host.locator(".kj-bubble p").first()).toHaveText("Runden ble avbrutt.", { timeout: 15000 });
  await expect(guest.locator(".kj-bubble p").first()).toHaveText("Runden ble avbrutt.", { timeout: 15000 });
  await expect(guest.getByRole("button", { name: "Avbryt runden" })).toHaveCount(0);

  await hostCtx.close();
  await guestCtx.close();
});
