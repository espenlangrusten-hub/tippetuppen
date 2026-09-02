import { test, expect } from "@playwright/test";

/**
 * A two-word surname such as "MØLLER WOLFE" needs eleven tiles. At a fixed tile
 * width that was 468px of tiles on a 390px phone, so the last letters were pushed
 * off the screen and could not be seen while typing. Tiles now scale to fit.
 */
const longNamePuzzle = {
  ok: true,
  game: "mangler-xi",
  isArchive: false,
  today: "2026-09-02",
  puzzle: {
    puzzleId: "test-long-name",
    number: 1,
    date: "2026-09-02",
    title: "Test",
    matchDate: "2025-11-16",
    competition: "VM-kvalifisering 2025",
    stage: null,
    opponent: "Italia",
    opponentCode: "ITA",
    norwayHome: false,
    score: [4, 1],
    venue: "San Siro",
    city: "Milano",
    manager: "Ståle Solbakken",
    formation: "4-1-4-1",
    status: "single_source",
    opponentScorers: [],
    players: Array.from({ length: 11 }, (_, i) => ({
      index: i,
      pos: i === 0 ? "GK" : i < 5 ? "CB" : i < 9 ? "CM" : "CF",
      no: i + 1,
      captain: false,
      goals: 0,
      // The first outfield shirt carries the long two-word name.
      wordLengths: i === 1 ? [6, 5] : [4],
      row: i === 0 ? 0 : i < 5 ? 1 : i < 9 ? 2 : 3,
      col: i === 0 ? 0 : (i - 1) % 4,
      cols: i === 0 ? 1 : 4,
    })),
  },
};

test("a long two-word name still fits the screen", async ({ page }, testInfo) => {
  await page.route("**/today?game=mangler-xi", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(longNamePuzzle) }),
  );

  await page.goto("/mangler-xi/");
  await page.getByRole("button", { name: "Kjør!" }).click({ timeout: 8000 }).catch(() => {});

  // Pick the shirt whose answer is "MØLLER WOLFE" (11 letters across two words).
  await page.getByRole("button", { name: /^Drakt 2/ }).click();
  const row = page.locator('[aria-label="Ditt forsøk"]');
  await expect(row).toBeVisible();

  const tiles = row.locator(".tile:not(.tile-space)");
  expect(await tiles.count()).toBe(11);

  const viewport = page.viewportSize()!;
  const box = (await row.boundingBox())!;
  expect.soft(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

  // Every single tile must be inside the screen, including the last one.
  for (let i = 0; i < 11; i++) {
    const t = (await tiles.nth(i).boundingBox())!;
    expect(t.x + t.width, `tile ${i + 1} is off screen`).toBeLessThanOrEqual(viewport.width);
    expect(t.width, `tile ${i + 1} is too small to read`).toBeGreaterThan(18);
  }
  await page.screenshot({ path: `e2e/screenshots/long-name-${testInfo.project.name}.png` });
});
