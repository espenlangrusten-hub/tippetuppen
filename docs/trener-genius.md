# Trener Genius

The user authorized publication on 24 September 2026 after local verification.

Four daily coach questions with four options each: one easy, two medium, one hard.
Normal answers award 25/0. Once per round, «Gå offensivt» awards 50/−25.
50/50 removes two wrong choices once per round and awards 10/0. It cannot be
combined with offensive play on that question. Only the final sum is clamped to
0–100, matching the other daily league games' maximum.

The API owns questions, answer validation, attempts and points. Each account has
one attempt per puzzle; row locking and a unique league result prevent replay
scoring. Refresh resumes the attempt. Guests use an unguessable attempt ID and
do not receive league points. Sign in before starting. No answer keys, future
questions or source facts are sent before answering. Day rollover locks old rounds.

## Question bank

`data/source/trenerquiz.json` is the existing coach bank and remains untouched.
`data/source/trener-genius.json` adds reviewed distractors, difficulty, facts and
sources. The first 24 entries (six rounds, 24 September) were written by hand. On
25 September 117 more were added, giving 33 daily rounds (to about 27 October).

**Source check.** A bank question at `single_source` only means its article
contains the `verify` keywords - «Arne Erlandsen» and «2006», say - not that the
article says what the question claims. So on 25 September the article sentences
behind every new entry were printed (a one-off Action; the sandbox cannot reach
Wikipedia) and read against the question, the answer and the fact shown after it:
- 16 were dropped because the article does not back the claim (nicknames, quotes,
  exact dates, a caretaker spell, the Fredrikstad cup coach in 2006).
- 30 prompts were narrowed to what the article says. Three were wrong as written:
  Club Brugge won in 2003 and 2005, not 2004; Hareide left Brøndby *before* the 2002
  title; Tom Lund coached Lillestrøm 1985–1988, not –1987.
- Facts the article does not support were replaced with ones it does (one was wrong:
  Strømsgodset finished 10th in 2007, not 11th).
- 21 unused candidates whose article states answer and year in the same sentence
  replaced them, skipping any that another question or fact would give away.

**Wrong answers** were drafted with these rules, then read through one by one:
- A wrong coach is never one who, according to `trenere.json`, coached the club named
  in the question in the year it names; it is from the same era, and from the same
  country when the question says «svensk», «dansk» and so on.
- A wrong club is never one the coach has coached, and is an established top-flight
  side (no Sarpsborg 08 in a 1994 question) - from the same region or city when the
  question says «Oslo-klubb», «nordnorsk», «Göteborg-klubb» and so on, and from the
  right country for Danish, Swedish, Belgian, Dutch, Greek and German clubs.
- Wrong years are the neighbouring years; wrong countries were checked against the
  match archive (no other 2–0 home win in 1993, no other 2–1 win at the 1998 World Cup).
- New entries are ordered by a hash, so questions about the same club and season land
  on different days.

`trenere.json` itself is still at `recall`, so the wrong-coach rule is only as good as
the coaching spells it lists. The next extension needs more easy (level 1) questions:
every sourced easy question in the bank is now used, and each round takes one.
Unreviewed bank entries are deliberately excluded. If no daily round exists, the
screen says the round is not ready; it does not silently repeat questions.

The builder validates source identity/answer, rejects duplicate choices, and
gives everyone identical daily rounds with four different coaches. Sources remain
visible in the answer reveal. The generated coach is a fictional illustration,
created for this implementation, not a portrait of a named coach.

## Local verification

Run `npm run db:migrate`, `npm run db:seed`, and `npm run data:schedule -- --days 10`
against the local PGlite database. Build the static export, start `scripts/dev-stack.sh`
with local `ADMIN_KEY` and `ANALYTICS_SALT`, and serve `out/` on port 3200.
`npx playwright test e2e/trener-genius.spec.ts --workers=1` exercises real API
ownership, refresh persistence, tactics, replay prevention and league scoring on
mobile and desktop. Unit tests cover negative scores, final caps and hidden answers.

## Deployment

Apply migration `0011_trener_genius.sql`, deploy the API with its shared modules,
schedule reviewed rounds, then deploy the static frontend. Keep this order so the
new card never points at a missing API/table. Existing games and scores are preserved.
The new game joins monthly totals when deployed; choose an appropriate launch date
before enabling it. The deploy workflow prepares the database and daily schedule
before the API, and waits for the API before publishing the frontend. Database
preparation shares a concurrency group with the data workflow.
