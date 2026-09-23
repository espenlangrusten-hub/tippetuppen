# Content audit — first batch, 9 September 2026

Scope: honours used by Målløs and Straffespark; no edits to XI matches or player clues.

## Changes

- Correct 2011 top scorer from Sigurd Rushfeldt to Mustafa Abdellaoue (17 goals), from the explicitly read 2011 row in the linked top-scorer table.
- Add Kristian Eriksen (2024, 14 goals) and Daniel Karlsbakk (2025, 18), from the clubs' own reports. Direct sources are in honours.json.
- Give the aggregate cup-winner and top-scorer questions a closed year range. A source ending in 2025 cannot support an unbounded “since 1990” question forever.
- Add four individually read, primary-source Molde history questions. Their sources and dates are attached to the records.

## Counts in this branch

- Honours: 79 → 81 records, plus one corrected record.
- Straffespark: 142 → 148 playable individual questions (146 trivia, 1 photo, 1 chant). Not 148 complete rounds.
- XI: untouched, 54 source matches; status counts 9 verified, 42 single_source, 2 uncertain, 1 recall.
- Finn spilleren: untouched, 30 profiles.
- New approved images: 0. Image sourcing and visual/licence review remain outstanding.
- Målløs: answer coverage expanded; no claim of additional unique daily puzzles or production runway from this batch.

## Remaining quality risks

- Older source records often cite search excerpts rather than a read source. Technical validation does not prove historical correctness or complete answer sets.
- Season-membership windows reuse club sets. Count distinct answer fingerprints separately from generated IDs.
- Relegation questions need complete evidence including play-offs; membership-only tables are insufficient.
- Production puzzles are materialized. Review data import/scheduling results and affected existing puzzles after merge; do not claim old published rounds corrected just because the source file changed.
- No results, league scores or historical records were edited by this batch.

No changes should be interpreted as certifying the entire database. Continue auditing before scaling to a 365-day unique-content target.
