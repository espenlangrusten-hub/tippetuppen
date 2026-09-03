# Tippetuppen – prosjektlogg

Kort logg over viktige beslutninger, milepæler og blokkere. Nyeste øverst.

## 2026-09-02 (kveld) – Arkitekturskifte: bare GitHub og Supabase

Eieren vil ikke bruke Vercel eller andre leverandører. GitHub Pages serverer bare statiske filer, og det kolliderer med at fasiten aldri skal ligge i nettleseren. Løsningen:

- **Statisk nettsted** på GitHub Pages (`output: "export"`, `basePath` styrt av miljøvariabel).
- **Supabase Edge Function** (`supabase/functions/api`, Deno) eier all logikk som ser fasiten: maskerte puslespill, gjettevurdering, hint, Målløs-poeng og innsending, anonym statistikk og admin-rutene bak `ADMIN_KEY`.
- **GitHub Actions** er «serveren» for data: `data.yml` importerer `data/source` og forlenger dagsplanen, ukentlig og på knappetrykk.
- **Delt regel-kode:** `src/lib` kopieres til funksjonen av `scripts/sync-shared.ts`, og en test feiler hvis kopiene kommer ut av takt. Da kan ikke nettleseren og serveren regne ulikt.
- **Admin** ble en klientkonsoll som autentiserer med en nøkkel i sessionStorage. Datarettinger gjøres i repoets JSON-filer, som gir versjonskontroll på kjøpet.

Verifisert lokalt ved å kjøre PGlite over Postgres-protokollen, funksjonen under Deno og den statiske eksporten samtidig; Playwright spiller begge spillene gjennom hele stacken.

Merk: repoet må gjøres offentlig for at GitHub Pages skal være gratis.

## 2026-09-02 – Produksjonsdatabase og førstegangsoppsett

- **Supabase:** gjenbruker prosjektet `dommer` (eier valgte dette framfor nytt prosjekt). Prosjektet er gjenopprettet fra pause.
- **Skjema-isolasjon:** alle Tippetuppen-tabeller flyttet til Postgres-skjemaet `tippetuppen`, slik at de ikke kolliderer med dommer-tabellene (`clubs` og `matches` fantes fra før i `public`). Migrasjonen er kjørt mot Supabase, og Drizzle-journalen er registrert slik at `db:migrate` ikke kjører den på nytt.
- **Førstegangsoppsett uten terminal:** seed-logikken er flyttet til `src/server/seed.ts` og eksponert som en admin-handling («Last inn kildedata + planlegg»). `outputFileTracingIncludes` sørger for at `data/source` følger med serverbunten. Eieren trenger derfor ikke kjøre kommandoer for å fylle databasen.

## 2026-09-01 – Første byggeøkt (autonom)

### Beslutninger
- **Produktnavn:** Tippetuppen (repo-navnet). Spillene heter Mangler XI og Målløs (arbeidstitlene beholdt – de er korte, norske og forklarer seg selv).
- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind 4, Drizzle ORM mot Postgres. Lokalt/tester: innebygd PGlite (ingen tjenester å starte). Produksjon: `DATABASE_URL` (Supabase Postgres). Én Postgres-schema, to drivere.
- **Datamodell:** spillere, alias, klubber, konkurranser, kamper, innhopp/oppstillinger, mål, sesonger/tabeller, utmerkelser, tropper, puslespill, plan, folkemengde-svar (Målløs), hendelser (analyse), admin-logg, innstillinger. Kildefiler i `data/source/*.json` → `npm run db:seed` → `npm run data:schedule`.
- **Kildestatus:** `verified` (≥2 kilder), `single_source` (1 dokumentert kilde), `recall` (redaksjonell hukommelse, ikke sjekket), `uncertain` (motstridende), `rejected`. Standard rotasjonspolicy: kun `verified` + `single_source`. Policy kan endres i admin.
- **Mangler XI-mekanikk:** ekte startellever, drakt for drakt, wordle-feedback per bokstav (ÆØÅ som egne brikker), 6 forsøk per spiller, hint = første bokstav (koster ett forsøk). Alias-treff (Håland/Haaland) godtas som løst. Svar evalueres på serveren; fasit sendes aldri til nettleseren før runden er over.
- **Målløs-mekanikk:** fem svar, poeng = anslått andel av 100 spillere som svarer det samme. Vi kan ikke spørre 100 fans på forhånd, så poengene blander en redaksjonell prior (kjendisgrad) med ekte svarfrekvens fra spillerne våre; etter 100 respondenter er poengene ren folkemengde. Poengene per svar holdes skjult til alle fem er levert – både i UI og i API-et, siden `/maalloes/answer` bare returnerer `{ ok, id, label }` – slik at ingen kan styre de resterende svarene etter fasit. «Målløs» (0) gir skjold som stryker dårligste svar. Tabellplassering (Seriemester → Nedrykk) beregnes fra svarfordelingen i hvert spørsmål.
- **Personvern/annonser:** ingen sporingskapsler for statistikk (daglig roterende anonym hash på serveren). Spillfremgang i localStorage. AdSense aktiveres kun med `NEXT_PUBLIC_ADSENSE_CLIENT`; i EØS kreves Google-sertifisert CMP (TCF 2.3) for personlige annonser – `NEXT_PUBLIC_CMP=funding-choices` kobler inn Googles egen CMP. Uten CMP: enkel banner og ikke-personlige annonser.
- **Annonseplasseringer:** under dagens spill på forsiden, under resultatkortet i begge spill, i arkivet. Aldri over banen eller mellom input og spill. Reservert høyde mot layout-hopp.

### Blokkere / avvik
- **Nettverk i byggemiljøet:** wikipedia.org, eu-football.info, 11v11, RSSSF, fotball.no m.fl. er blokkert av egress-proxyen. Kun søkemotor-sammendrag var tilgjengelig. Dataene er derfor bekreftet via søkeutdrag fra dokumenterte kilder (URL lagret per kamp), ikke ved å lese kildesidene direkte. Alle kamper med full elleve i utdraget er merket `single_source`; ufullstendige er `recall`/`uncertain` og holdes utenfor rotasjonen.
- **Konsekvens:** innholdsrekkevidden er begrenset i første versjon. Wikipedia-importøren (`scripts/import/wikipedia.ts`) er skrevet og enhetstestet, men må kjøres fra en maskin med normal internettilgang.
- **Supabase:** kontoen har to prosjekter (gratisnivåets grense). Nytt prosjekt for Tippetuppen krever eierens valg (betale eller gjenbruke/pause et eksisterende).

### Status ved slutten av økten
- Kamper i databasen: 47 (44 kvalifisert for rotasjon, 1 usikker, 2 fra hukommelse). Målløs-puslespill: 34 (33 kvalifisert).
- Innholdsrekkevidde: Mangler XI 43 dager, Målløs 33 dager. Wikipedia-importøren er veien til flere hundre kamper (krever kjøring utenfor byggemiljøet).
- Tester: 25 enhetstester (navn, datoer/DST, brikker, rekker, wikitext-parser) og 3 Playwright-flyter på iPhone-visning grønne. Lint, typecheck og produksjonsbygg grønne.
- Søkebudsjettet (200 søk) ble brukt opp på kildeverifisering; flere kamper med delvis bekreftelse ligger i notatene per kamp.

### Milepæler
- Pipeline: validering, seed, puslespillgenerering, planlegger med variasjonsstyring (oppstillingslikhet, motstander, tiår, vanskelighetsgrad), innholdsrekkevidde.
- Mangler XI og Målløs spillbare ende-til-ende, arkiv, statistikk, deling, admin, analyse, samtykke, SEO-metadata.
