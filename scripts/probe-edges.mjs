/**
 * Try to break the games from outside the browser.
 *
 * Everything here goes straight at the Edge Function, because the UI's own guards
 * (disabled buttons, an in-flight flag) are exactly what an attacker or a flaky network
 * removes. What survives this is server-authoritative; what does not is a bug the UI is
 * merely hiding.
 *
 *   node scripts/probe-edges.mjs
 */
const API = process.env.E2E_API_URL ?? "http://localhost:8000/api";
const post = (path, body) =>
  fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const get = (path) => fetch(API + path).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FEIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function maalloes() {
  console.log("\n== Målløs ==");
  const today = (await get("/today?game=maalloes")).body;
  const puzzleId = today?.puzzleId ?? today?.puzzle?.puzzleId ?? today?.id;
  check("dagens oppgave har en id", !!puzzleId, String(puzzleId));
  if (!puzzleId) return;

  const payload = today?.puzzle ?? today;
  check("fasiten lekker ikke før innsending", !(payload?.answers?.length > 0), `answers=${payload?.answers?.length ?? 0}`);

  const probe = await post("/maalloes/answer", { puzzleId, text: "Rosenborg" });
  check("enkeltsvar-endepunktet røper ikke om svaret er gyldig",
    probe.body?.pending === true && probe.body?.score === undefined, JSON.stringify(probe.body));

  const five = Array.from({ length: 5 }, (_, i) => ({ id: null, text: `tullesvar ${i}` }));
  const [a, b] = await Promise.all([
    post("/maalloes/submit", { puzzleId, answers: five }),
    post("/maalloes/submit", { puzzleId, answers: five }),
  ]);
  check("to samtidige innsendinger svarer begge", a.status === 200 && b.status === 200);
  check("fem ugyldige svar koster 100 hver", a.body?.scores?.every((s) => s === 100), JSON.stringify(a.body?.scores));

  const short = await post("/maalloes/submit", { puzzleId, answers: five.slice(0, 3) });
  check("for få svar avvises", short.status === 400, `status ${short.status}`);
  const long = await post("/maalloes/submit", { puzzleId, answers: [...five.slice(0, 4), { id: null, text: "x".repeat(200) }] });
  check("for langt svar avvises", long.status === 400, `status ${long.status}`);
  const nonsense = await post("/maalloes/submit", { puzzleId: "finnes-ikke", answers: five });
  check("ukjent oppgave gir 404", nonsense.status === 404, `status ${nonsense.status}`);
}

async function kjappen() {
  console.log("\n== Kjappen ==");
  const made = await post("/kjappen/create", { name: "Vert" });
  const code = made.body?.code;
  check("runde opprettet med kode", !!code, String(code));
  if (!code) return;
  const host = made.body.playerId;

  const guests = [];
  for (const name of ["A", "B", "C"]) {
    const r = await post("/kjappen/join", { name, code });
    if (r.body?.playerId) guests.push(r.body.playerId);
  }
  check("tre gjester kom inn", guests.length === 3, `${guests.length}`);

  const tooMany = await post("/kjappen/join", { name: "D", code });
  check("femte spiller avvises", tooMany.body?.ok === false, tooMany.body?.error ?? "");

  const blank = await post("/kjappen/join", { name: "   ", code });
  check("tomt navn avvises", blank.body?.ok === false, blank.body?.error ?? "");
  const weird = await post("/kjappen/create", { name: "<script>alert(1)</script>" });
  check("rart navn tas imot og lagres som tekst",
    weird.body?.ok === true && weird.body.players[0].name.length <= 18, weird.body?.players?.[0]?.name);

  const notMine = await post("/kjappen/start", { code, playerId: guests[0] });
  check("bare verten kan starte", notMine.body?.ok === false, notMine.body?.error ?? "");
  const ghost = await post("/kjappen/state", { code, playerId: "finnes-ikke" });
  check("ukjent spiller avvises", ghost.body?.ok === false, ghost.body?.error ?? "");

  await post("/kjappen/start", { code, playerId: host });
  // The opening countdown has to elapse before the first question opens.
  await new Promise((r) => setTimeout(r, 6000));
  let state = (await post("/kjappen/state", { code, playerId: host })).body;
  check("runden står i spørsmålsfasen etter nedtellingen", state?.phase === "question", state?.phase);

  // Four browsers hit the buzzer in the same tick.
  const race = await Promise.all([host, ...guests].map((p) => post("/kjappen/buzz", { code, playerId: p })));
  const owners = new Set(race.map((r) => r.body?.buzzedBy).filter(Boolean));
  check("samtidig buzz gir nøyaktig én eier", owners.size === 1, [...owners].join(","));

  const winner = [...owners][0];
  const loser = [host, ...guests].find((p) => p !== winner);
  const stolen = await post("/kjappen/answer", { code, playerId: loser, guess: "juks" });
  check("den som ikke buzzet kan ikke svare", stolen.body?.outcome?.playerId !== loser, JSON.stringify(stolen.body?.outcome));

  const before = state.players.find((p) => p.id === winner)?.score ?? 0;
  const [r1, r2] = await Promise.all([
    post("/kjappen/answer", { code, playerId: winner, guess: "definitivt feil" }),
    post("/kjappen/answer", { code, playerId: winner, guess: "definitivt feil" }),
  ]);
  const after = (r2.body?.players ?? r1.body?.players ?? []).find((p) => p.id === winner)?.score ?? 0;
  check("dobbelt svar trekker bare én gang", after === before - 100, `${before} -> ${after}`);

  await post("/kjappen/cancel", { code, playerId: host });
  const done = (await post("/kjappen/state", { code, playerId: host })).body;
  check("avbrutt runde står som ferdig", done?.phase === "done", done?.phase);
}

async function finn() {
  console.log("\n== Finn spilleren ==");
  const today = (await get("/today?game=finn-spilleren")).body;
  const id = today?.puzzleId ?? today?.puzzle?.puzzleId ?? today?.id;
  check("dagens oppgave finnes", !!id, String(id));
  const payload = today?.puzzle ?? today;
  const leaked = JSON.stringify(payload ?? {}).toLowerCase();
  check("fasiten ligger ikke i nyttelasten", !leaked.includes('"answer"') || !payload?.answer, "");
}

await maalloes();
await kjappen();
await finn();
console.log(`\n${failures === 0 ? "Alle kontroller passerte." : `${failures} kontroll(er) feilet.`}`);
process.exit(failures === 0 ? 0 : 1);
