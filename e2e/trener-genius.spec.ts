import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Test-only oracle. Answers must never be imported by the client application.
const bank = JSON.parse(readFileSync("data/source/trenerquiz.json", "utf8")) as {prompt:string;answer:{label:string}}[];
const api = process.env.E2E_API_URL ?? "http://localhost:8000/api";

test("Trener Genius persists a round, guards answers and awards league points once", async ({page, request}, info) => {
  const registration = await request.post(`${api}/auth/register`, {data:{username:`genius-${Date.now()}`,password:"local-test-password"}});
  const session = await registration.json();
  expect(session.ok).toBe(true);
  const headers = {"x-session-token":session.token};
  await page.goto("/");
  await page.evaluate(({token,user}) => {localStorage.setItem("tt-session",token);localStorage.setItem("tt-user",JSON.stringify(user));},session);
  await expect(page.getByRole("link",{name:"Spill Trener Genius",exact:true})).toBeVisible();
  await page.screenshot({path:`e2e/screenshots/genius-home-${info.project.name}.png`,fullPage:true});
  await page.getByRole("link",{name:"Spill Trener Genius",exact:true}).click();
  const start = await (await request.post(`${api}/trener-genius/start`,{headers,data:{}})).json();
  expect(start.reveal).toBeNull();
  expect(JSON.stringify(start)).not.toContain("answerIndex");
  const attack = await request.post(`${api}/trener-genius/answer`,{data:{attemptId:start.attemptId,index:0,option:0}});
  expect(attack.status()).toBe(404);
  await expect(page.getByRole("group",{name:"Svaralternativer"})).toBeVisible();
  await page.screenshot({path:`e2e/screenshots/genius-game-${info.project.name}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (let index=0;index<4;index++) {
    const current = await (await request.post(`${api}/trener-genius/start`,{headers,data:{}})).json();
    expect(current.attemptId).toBe(start.attemptId);
    expect(current.index).toBe(index);
    const correct = bank.find(q=>q.prompt===current.question.prompt)!.answer.label;
    if(index===0) await page.getByRole("button",{name:/Gå offensivt/}).click();
    if(index===1) {
      await page.getByRole("button",{name:/50\/50-hjelp/}).click();
      await expect(page.getByRole("button",{name:/50\/50 brukt/})).toBeDisabled();
    }
    // Whole-label match: a substring filter picks "Notodden" as well as "Odd".
    const exactly = new RegExp(`^[A-D] ${correct.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`);
    await page.getByRole("group",{name:"Svaralternativer"}).getByRole("button",{name:exactly}).click();
    await page.getByRole("button",{name:/Lås (offensivt svar|svaret)/}).click();
    await expect(page.getByRole("button",{name:index===3?/Se resultatet/:/Neste spørsmål/})).toBeVisible();
    const replay = await (await request.post(`${api}/trener-genius/answer`,{headers,data:{attemptId:start.attemptId,index,option:0}})).json();
    expect(replay.answers).toHaveLength(index+1);
    await page.reload();
    await expect(page.getByRole("button",{name:index===3?/Se resultatet/:/Neste spørsmål/})).toBeVisible();
    await page.getByRole("button",{name:index===3?/Se resultatet/:/Neste spørsmål/}).click();
  }
  await expect(page.getByRole("button",{name:"Del resultatet ↗"})).toBeVisible();
  await expect(page.getByText("Poengene er registrert i månedsligaen.")).toBeVisible();
  const final = await (await request.post(`${api}/trener-genius/start`,{headers,data:{}})).json();
  expect(final.total).toBe(110);
  expect(final.points).toBe(100);
  expect(final.phase).toBe("done");
  const board = await (await request.get(`${api}/leaderboard`,{headers})).json();
  expect(board.me.points).toBe(100);
  expect(board.me.played).toBe(1);
  await page.goto("/");
  await expect(page.getByRole("link",{name:"Se resultat for Trener Genius",exact:true})).toContainText("Fullført");
});
