import { test, expect } from "@playwright/test";

test("homepage caption sits beside the Kjappen arrow", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("link", { name: "Spill Kjappen quizshow med venner" });
  const caption = card.locator("div").filter({ has: page.getByText("2–4 spillere · 5 spørsmål", { exact: true }) }).last();
  const arrow = card.locator("span[aria-hidden=true]");
  const c = await caption.boundingBox();
  const a = await arrow.boundingBox();
  expect(c).not.toBeNull();
  expect(a).not.toBeNull();
  expect(c!.x + c!.width).toBeLessThanOrEqual(a!.x);
  expect(Math.abs(c!.y + c!.height - a!.y - a!.height)).toBeLessThan(12);
});

test("full body host loads without a frame or crop", async ({ page }, info) => {
  await page.goto("/kjappen/");
  await page.getByRole("button", { name: "Lag runde" }).click();
  await page.getByLabel("Navnet ditt").fill("Layoutkontroll");
  await page.getByRole("button", { name: "Videre" }).click();
  const host = page.getByAltText("Programlederen", { exact: true });
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("src", /host-full\.webp/);
  await expect(host).toHaveCSS("object-fit", "contain");
  await expect(page.locator(".kj-host-frame")).toHaveCSS("border-top-width", "0px");
  expect(await host.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBeGreaterThan(0);
  const box = await host.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `e2e/screenshots/kjappen-full-host-${info.project.name}.png`, fullPage: true });
});
