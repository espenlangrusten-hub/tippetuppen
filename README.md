# Tippetuppen – dagens norske fotballspill

Tre daglige spill for norske fotballfans:

- **Mangler XI** – fyll ut Norges startellever fra en ekte landskamp (1990–2026), bokstav for bokstav.
- **Målløs** – ett spørsmål om norsk fotball, fem svar; jo færre andre som svarer det samme, jo bedre.
- **Finn spilleren** – fem kildebaserte hint; tidlig riktig svar gir flest poeng.

Nytt spill hver dag kl. 00:00 norsk tid (Europe/Oslo).

## Arkitektur

Hele produktet kjører på GitHub og Supabase – ingen andre leverandører.

| Lag | Hvor | Hva |
| --- | --- | --- |
| Nettsted | GitHub Pages | Statisk eksport av Next.js-appen |
| Spill-API | Supabase Edge Function (`supabase/functions/api`) | Alt som ikke tåler å ligge i nettleseren: fasit, gjettevurdering, Målløs-poeng |
| Database | Supabase Postgres, skjema `tippetuppen` | Kamper, spillere, puslespill, plan, statistikk |
| «Serveren» for data | GitHub Actions (`.github/workflows/data.yml`) | Importerer kildedata og fyller på dagsplanen |

Fasiten forlater aldri Edge-funksjonen. Nettleseren får bare ordlengder, og en test feiler hvis et svar noen gang skulle lekke inn i det maskerte svaret.

## Kom i gang lokalt

```bash
npm install
npm run db:migrate      # embedded PGlite i .data/pglite
npm run db:seed         # data/source/*.json → database
npm run data:schedule    # genererer puslespill og planlegger 400 dager
ADMIN_KEY=<lokal-nøkkel> ANALYTICS_SALT=<lokalt-salt> npm run dev:stack
                         # Postgres-protokoll + Edge-funksjonen under Deno på :8000
npm run build && npm start   # statisk eksport på :3200
```

`npm run dev` kjører fortsatt Next i utviklingsmodus, men spillene henter data fra `NEXT_PUBLIC_API_URL`, så `dev:stack` må kjøre ved siden av.

Tester: `npm test` (Vitest), `npm run check:deno` (Edge-funksjonen), `npm run e2e` (Playwright mot den statiske eksporten).

## Struktur

| Sti | Hva |
| --- | --- |
| `data/source/` | Kildefiler med kildereferanser og status. Sannheten om fotballdataene. |
| `scripts/` | Validering, seed, planlegging og import fra den avtalte NFF/Fotballdata-kilden |
| `src/lib/` | Ren spill-logikk (navn, brikker, datoer, baneoppsett) – deles med Edge-funksjonen |
| `supabase/functions/api/` | Spill-API-et |
| `src/app/`, `src/components/` | Den statiske frontenden |
| `docs/` | Driftsveiledning og prosjektlogg |

Regel-koden ligger ett sted: `scripts/sync-shared.ts` kopierer `src/lib` inn i funksjonen, og en test feiler hvis kopiene kommer ut av takt.

## Oppsett i produksjon

Se `docs/RUNBOOK.md`.

## Datakvalitet

Kildestatus per kamp: `verified`, `single_source`, `recall`, `uncertain`, `rejected`. Bare `verified` og `single_source` går inn i den daglige rotasjonen. Vi finner aldri på oppstillinger. Eliteserien/Tippeligaen har komplette sesongtabeller for hvert år 1990–2025; valideringen stopper byggingen hvis en sesong mangler eller er åpenbart ufullstendig.
