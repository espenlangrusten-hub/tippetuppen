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
sources for 24 questions, producing six unique daily rounds. **This is a starter
set, not a full launch runway.** Expand the reviewed layer before sustained release.
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
