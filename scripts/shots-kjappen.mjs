/**
 * Drive a whole Kjappen round through four browsers and photograph every screen.
 *
 * Four real browser contexts rather than one, because the things most worth looking at
 * are the ones that differ per player: who buzzed, who is dimmed, whose answer box is
 * open, and whether all four screens agree on which face belongs to whom. It prints
 * that last check rather than only taking pictures - a shared game where two people see
 * different avatars on the same player is a bug no screenshot would catch.
 *
 * Needs the local stack and the dev server running:
 *   npm run dev:stack
 *   NEXT_PUBLIC_API_URL=http://localhost:8000/api npx next dev
 *   node scripts/shots-kjappen.mjs [--mobile] --out <dir>
 */
import { chromium, devices } from "@playwright/test";
const mobile = process.argv.includes("--mobile");
const dir = process.argv[process.argv.indexOf("--out") + 1];
const BASE = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const opts = mobile ? { ...devices["iPhone 13"] } : { viewport: { width: 1440, height: 900 } };
const NAMES = ["Espen", "Lene", "Jacob", "Ada"];
const pages = [];
for (let i = 0; i < 4; i++) {
  const c = await b.newContext(opts);
  const p = await c.newPage();
  p.on("pageerror", (e) => console.log(`  [${NAMES[i]}] pageerror: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && console.log(`  [${NAMES[i]}] console: ${m.text()}`));
  await p.goto(BASE + "/kjappen/", { waitUntil: "domcontentloaded" });
  pages.push(p);
}
const [h, ...g] = pages;
const shot = async (p, n) => { await p.screenshot({ path: `${dir}/${n}.png` }); console.log(`  ${n}`); };

await shot(h, "01-velkommen");
await h.getByRole("button", { name: "Lag runde" }).click();
await h.getByLabel("Navnet ditt").fill("Espen");
await shot(h, "02-navn");
await h.getByRole("button", { name: "Videre" }).click();
await h.locator(".kj-code-big").waitFor({ timeout: 15000 });
const code = (await h.locator(".kj-code-big").innerText()).trim();
for (let i = 0; i < 3; i++) {
  const p = g[i];
  await p.getByRole("button", { name: "Tast inn kode" }).click();
  await p.getByLabel("Navnet ditt").fill(NAMES[i + 1]);
  await p.getByLabel("Koden du har fått").fill(code);
  if (i === 0) await shot(p, "03-bli-med");
  await p.getByRole("button", { name: "Videre" }).click();
  await p.locator(".kj-contestants").waitFor({ timeout: 15000 });
}
await wait(1500);
await shot(h, "04-lobby");

const faces = [];
for (const p of pages) faces.push((await p.locator(".kj-booth img").evaluateAll((e) => e.map((x) => x.getAttribute("src").match(/avatar-\d+/)[0]))).join(","));
console.log(`  avatarer per skjerm: ${faces.join(" | ")}`);
console.log(`  alle skjermer enige: ${new Set(faces).size === 1}  alle fire ulike: ${new Set(faces[0].split(",")).size === 4}`);

await h.getByRole("button", { name: /START/ }).click();
await wait(1600);
await shot(h, "05-sporsmal");

// Play all five questions: a different player grabs each one, alternately right
// and wrong, so both verdicts and both score directions get photographed.
for (let round = 1; round <= 5; round++) {
  const who = pages[(round - 1) % 4];
  await who.getByRole("button", { name: /TRYKK HER/ }).waitFor({ timeout: 40000 });
  await who.getByRole("button", { name: /TRYKK HER/ }).click();
  await wait(1200);
  if (round === 1) { await shot(who, "06-svarer-selv"); await shot(g[0], "07-andre-buzzet"); }
  const box = who.getByLabel("Skriv svaret");
  await box.fill(round % 2 ? "Helt feil svar" : "Ullevaal Stadion");
  await wait(300);
  if (round === 1) await shot(who, "08-snakkeboble");
  await who.getByRole("button", { name: "Send svar" }).click();
  await wait(700);
  if (round === 1) await shot(h, "09-dom");
  if (round === 2) await shot(h, "10-neste-sporsmal");
  await h.locator(".kj-verdict, .kj-sweep, .kj-final").first().waitFor({ timeout: 15000 }).catch(() => {});
  await wait(6200);
}
await h.locator(".kj-final").waitFor({ timeout: 40000 });
await wait(1200);
await shot(h, "11-finale");
await b.close();
