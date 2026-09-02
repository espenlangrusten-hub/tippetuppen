# Driftsveiledning (runbook)

## Miljøvariabler

| Variabel | Påkrevd | Beskrivelse |
| --- | --- | --- |
| `DATABASE_URL` | prod | Postgres-tilkobling (Supabase «Transaction pooler»-URL fungerer). Tom lokalt → PGlite i `.data/pglite`. |
| `ADMIN_PASSWORD` | prod | Passord til `/admin`. |
| `ADMIN_SESSION_SECRET` | prod | ≥16 tilfeldige tegn; signerer admin-cookien. |
| `ANALYTICS_SALT` | prod | Tilfeldig streng for den daglige anonyme besøksnøkkelen. |
| `NEXT_PUBLIC_SITE_URL` | prod | F.eks. `https://tippetuppen.no` (brukes i deling, sitemap, metadata). |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | valgfri | `ca-pub-…`. Tom = mock-plasseringer. |
| `NEXT_PUBLIC_ADSENSE_SLOT_HOME/RESULT/ARCHIVE/SIDEBAR` | valgfri | Annonseenhet-ID per plassering. |
| `NEXT_PUBLIC_CMP` | valgfri | `funding-choices` for Googles sertifiserte CMP (kreves for personlige annonser i EØS). |

## Første gangs oppsett i produksjon

1. Opprett Postgres (Supabase). Legg inn `DATABASE_URL` i deploy-miljøet **og** lokalt i `.env` for seeding.
2. `npm run db:migrate && npm run db:seed && npm run data:schedule -- --days 400`
3. Deploy. Sjekk `/admin` → Oversikt: begge spill skal ha «I dag» og «I morgen».
4. AdSense: legg til nettstedet i AdSense, aktiver «Privacy & messaging» (EU-melding), sett `NEXT_PUBLIC_ADSENSE_CLIENT` og `NEXT_PUBLIC_CMP=funding-choices`, opprett annonseenheter og legg inn slot-ID-ene.

## Daglig drift

- Ingen daglig jobb kreves: planen ligger i databasen. Når «Dager igjen» i admin nærmer seg 30, legg til data og kjør `npm run data:schedule` (eller «Regenerer» i admin).
- Bytt ut et dårlig puslespill: Admin → Plan → «Bytt ut». Deaktiver et ødelagt puslespill: Admin → Puslespill → «Deaktiver» (framtidige datoer byttes automatisk).
- Datafeil: Admin → Kamper → endre status/notat; Admin → Spillere → alias/etternavn. Kjør `npm run data:export` og commit for å få endringene inn i kildefilene.

## Legge til flere kamper

1. Lag `data/source/matches/YYYY-MM-DD-xxx-yyy.json` (se eksisterende filer). Krav: 11 startere, én keeper, kilde-URL, status.
2. `npm run data:validate` → `npm run db:seed` → `npm run data:schedule`.
3. Skalering: `npx tsx scripts/import/wikipedia.ts "1998 FIFA World Cup Group A"` lager utkast i `data/source/drafts/` fra Wikipedia (krever internettilgang til wikipedia.org). Gå gjennom posisjoner før du flytter fila til `matches/`.

## Innholdsrekkevidde

`npm run data:runway` eller Admin → Oversikt. Tall: kvalifiserte puslespill, publiserte, planlagte, ubrukte, dager igjen.

## Feilsøking

- «Dagens spill er ikke klart»: planen mangler for dagens Oslo-dato → kjør `data:schedule`.
- PGlite-lås lokalt: stopp andre prosesser som bruker `.data/pglite`, eller slett mappa og kjør `db:reset`.
- Playwright: bruker Chromium fra `PLAYWRIGHT_BROWSERS_PATH`; `npx playwright install chromium` ved behov.
