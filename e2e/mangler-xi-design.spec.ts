import { test, expect } from "@playwright/test";

// Fixture isolates this presentation change from daily content and network availability.
const players = Array.from({ length: 11 }, (_, i) => ({
  index: i, pos: i === 0 ? "GK" : i < 5 ? "CB" : i < 9 ? "CM" : "CF",
  no: i + 1, captain: i === 3, goals: 0, wordLengths: [6],
  row: i === 0 ? 0 : i < 5 ? 1 : i < 9 ? 2 : 3, col: i, cols: i === 0 ? 1 : i < 9 ? 4 : 2,
}));
const fixture = { ok: true, game: "mangler-xi", isArchive: false, today: "2026-09-26", puzzle: {
  puzzleId: "design-regression", number: 25, date: "2026-09-26", title: "Design test",
  matchDate: "2011-08-10", competition: "Privatlandskamp", stage: null, opponent: "Tsjekkia", opponentCode: "CZE",
  norwayHome: true, score: [3, 0], venue: null, city: null, manager: null, formation: "4-4-2", status: "verified", opponentScorers: [], players,
} };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/today")) return route.fulfill({ json: fixture });
    if (path.endsWith("/guess")) {
      const { guess } = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, guess, tiles: Array(6).fill("absent"), solved: false } });
    }
    if (path.endsWith("/reveal")) {
      const data = route.request().postDataJSON();
      if (data.kind === "fact") return route.fulfill({ json: { ok: true, fact: "Spilleren har representert Norge.", remaining: 1 } });
      if (data.hint) return route.fulfill({ json: { ok: true, letter: "S" } });
      return route.fulfill({ json: { ok: true, players: players.map(() => ({ name: "Eksempel Spiller", answer: "SPILLER" })), notes: null } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/mangler-xi/");
  await page.getByRole("button", { name: "Kjør!" }).click();
});

test("pitch, keyboard, all attempts and saved progress survive the redesign", async ({ page }, info) => {
  await expect(page.locator("button[aria-label^='Drakt']")).toHaveCount(11);
  await page.getByRole("button", { name: /^Drakt 10,/ }).click();
  await expect(page.getByRole("heading", { name: "Spiller 10", exact: true })).toBeVisible();
  // Both physical keyboard and explicit submit keep their existing API contract.
  for (const c of ["Q", "W", "X", "Z", "V"]) {
    await page.keyboard.type(c.repeat(6));
    await page.getByRole("button", { name: "Sjekk svar", exact: true }).click();
    await expect(page.locator("[aria-label^='Forsøk: ']")).toHaveCount(["Q", "W", "X", "Z", "V"].indexOf(c) + 1);
  }
  await expect(page.getByText("Forsøk 6/6")).toBeVisible();
  await page.getByRole("button", { name: "Send inn", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Send inn", exact: true })).toBeInViewport();
  await page.reload();
  await expect(page.locator("[aria-label^='Forsøk: ']")).toHaveCount(5);
  await expect(page.getByText("Forsøk 6/6")).toBeVisible();
  await page.getByRole("button", { name: "Velg en annen spiller" }).click();
  await page.getByRole("button", { name: /^Drakt 9,/ }).click();
  await expect(page.getByRole("heading", { name: "Spiller 9", exact: true })).toBeVisible();
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const pitch = (await page.locator(".mxi-pitch").boundingBox())!;
  const panel = (await page.locator(".mxi-guess-panel").boundingBox())!;
  if (info.project.name === "desktop") {
    expect(panel.x).toBeGreaterThan(pitch.x + pitch.width);
    expect(Math.abs(panel.y - pitch.y)).toBeLessThan(3);
  } else expect(panel.y).toBeGreaterThanOrEqual(pitch.y + pitch.height);
  await page.screenshot({ path: `e2e/screenshots/mangler-xi-design-${info.project.name}.png`, fullPage: true });
});

test("hints, instructions and give-up confirmation remain usable", async ({ page }) => {
  await page.getByRole("button", { name: /^Drakt 10,/ }).click();
  await page.getByRole("button", { name: /Første bokstav/ }).click();
  await expect(page.getByText("Forsøk 2/6")).toBeVisible();
  await page.getByRole("button", { name: /Fakta/ }).click();
  await expect(page.getByText("Spilleren har representert Norge.")).toBeVisible();
  await expect(page.getByText("Forsøk 3/6")).toBeVisible();
  await page.getByRole("button", { name: /Slik spiller du/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Kjør!" }).click();
  await page.getByRole("button", { name: /Gi opp/ }).click();
  await expect(page.getByRole("dialog", { name: "Gi opp?" })).toBeVisible();
  await page.getByRole("button", { name: "Fortsett", exact: true }).click();
  await expect(page.getByText("Forsøk 3/6")).toBeVisible();
  await page.getByRole("button", { name: /Gi opp/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Gi opp", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Startelleveren" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Del resultatet" })).toBeVisible();
});
