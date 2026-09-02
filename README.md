# Tippetuppen – dagens norske fotballspill

To daglige spill for norske fotballfans:

- **Mangler XI** – fyll ut Norges startellever fra en ekte landskamp (1989–i dag), bokstav for bokstav.
- **Målløs** – ett spørsmål om norsk fotball, fem svar; jo færre andre som svarer det samme, jo bedre.

Nytt spill hver dag kl. 00:00 norsk tid (Europe/Oslo). Arkiv, rekker, deling, admin, analyse og annonseklar.

## Kom i gang

```bash
npm install
npm run db:migrate      # lager .data/pglite (innebygd Postgres) og kjører migrasjoner
npm run db:seed         # data/source/*.json → database
npm run data:schedule   # genererer puslespill og planlegger 400 dager
npm run dev             # http://localhost:3000
```

Tester: `npm test` (Vitest) og `npm run e2e` (Playwright, iPhone-visning). `npm run typecheck`, `npm run lint`, `npm run build`.

## Struktur

| Sti | Hva |
| --- | --- |
| `data/source/` | Kildefiler: kamper (én fil per kamp), spillere, klubber, sesonger, utmerkelser, tropper. Alle med kildereferanser og status. |
| `scripts/` | `validate-data`, `seed`, `schedule`, `runway`, `export-data`, `import/wikipedia`. |
| `src/db/schema.ts` | Drizzle-schema (Postgres). Migrasjoner i `drizzle/`. |
| `src/server/puzzles/` | Puslespillgeneratorer (Mangler XI, Målløs) og planlegger med variasjonsstyring. |
| `src/server/manglerXi.ts`, `maalloes.ts` | Spill-logikk på serveren (fasit sendes ikke til klienten). |
| `src/components/` | Spill-UI, annonser (`AdSlot`), samtykke, analyse-beacon. |
| `src/app/admin/` | Admin (passord i `.env`). |
| `docs/` | Prosjektlogg og driftsveiledning. |

## Produksjon

Se `docs/RUNBOOK.md`. Kort: sett `DATABASE_URL` (Supabase Postgres), `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `ANALYTICS_SALT`, `NEXT_PUBLIC_SITE_URL`; kjør `db:migrate`, `db:seed`, `data:schedule` mot produksjonsdatabasen; deploy (Vercel eller annen Node-vert). Annonser: `NEXT_PUBLIC_ADSENSE_CLIENT` + `NEXT_PUBLIC_CMP=funding-choices`.

## Datakvalitet

Kildestatus per kamp: `verified`, `single_source`, `recall`, `uncertain`, `rejected`. Bare `verified` og `single_source` går inn i den daglige rotasjonen (kan endres i admin). Vi finner aldri på oppstillinger: kamper uten dokumentert kilde holdes utenfor.
