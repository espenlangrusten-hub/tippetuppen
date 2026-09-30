import { test, expect } from "@playwright/test";

// Isolate layout from live rankings; these sample rows are never shipped in the UI.
const rows = ["Kniksen", "Nordlys", "Taktikkern", "Lillestrøm94", "Fotballetti"].map((username, i) => ({
  userId: String(i), username, rank: i + 1, points: 2840 - i * 65, played: 35 - i, avatar_id: i,
}));

test("reference illustrations and navigation fit desktop and small phones", async ({ page }, info) => {
  await page.route("**/api/**", route => route.fulfill({ json: { ok: true, rows, registered: 50, today: "2026-09-30" } }));
  const widths = info.project.name === "desktop" ? [1448, 1024, 768] : [390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1086 });
    for (const path of ["/", "/liga/", "/profil/"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".reference-art img").first()).toBeVisible();
      await expect.poll(() => page.locator(".reference-art img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (path === "/") {
        await expect(page.getByRole("link", { name: "Spill dagens XI", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "Spill Kjappen quizshow med venner" })).toBeVisible();
      }
      await page.screenshot({ path: `e2e/screenshots/reference-${width}-${path.replaceAll("/", "") || "home"}.png`, fullPage: true });
    }
  }
});
