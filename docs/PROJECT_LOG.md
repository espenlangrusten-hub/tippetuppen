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

## Screening av posisjoner og draktnumre (2026-09-03)

Rapportert: lagoppstillingen på banen og draktnumrene stemte ikke med virkeligheten, selv om elleveren var riktig. Screeningen bekreftet to uavhengige feil.

**1. Banen tegnet feil formasjon (11 av 47 kamper).** `layoutPitch` plasserte hver posisjon i en fast rekke, uavhengig av formasjon. Det holder ikke: en ving står på linje med spissen i 4-3-3, men bak ham i 4-2-3-1. Følgen var at alle ni 4-3-3-kampene ble tegnet som 4-3-2-1 med vingene bak spissen, 3-5-2 ble 3-2-3-2, og 4-1-4-1 ble 5-4-1 med den defensive midtbanespilleren inne i forsvarsrekken. Rekkene bygges nå fra den registrerte formasjonen: båndene fylles bakfra med de dypest spillende, så banen viser alltid formasjonen kampdataene oppgir. Bekreftet mot ESPNs oppstilling for Italia–Norge 16.11.2025, som deler linjene nøyaktig slik banen nå tegner dem.

**2. Draktnumrene var i stor grad gjettet.** Intern kontroll uten eksterne kilder: åtte spillere hadde forskjellig nummer i Estland (13.11.2025) og Italia (16.11.2025) – tre dager og én tropp fra hverandre, altså umulig. Totalt 18 spillere bar to numre innenfor samme kalenderår. Konfliktene lå nesten utelukkende i kamper der ingen kilde bekreftet numrene: 18 konflikter totalt, 3 blant de 14 kampene med bekreftede numre (og de tre er måneder fra hverandre, der omfordeling er normalt). Numrene er derfor fjernet fra de 33 kampene uten kildebekreftelse; drakten viser posisjonen i stedet. De 14 bekreftede beholdes.

**3. To kamper rettet.** England–Norge 03.09.2014 var registrert som 4-4-2 mens rollene beskriver 4-5-1 (elleveren og numrene er bekreftet mot lagoppstillingene; posisjonene er tilordnet). Satt til 4-5-1. Irland–Norge 28.06.1994 er nedgradert til `uncertain` og ute av rotasjon: kildene beskriver Egil Olsens 4-5-1 med Jostein Flo bredt til høyre, mens de registrerte rollene gir fem forsvarere og to spisser.

**Nye regler i `validate-data`,** slik at dette ikke kan gjenoppstå: formasjonen må gå opp i elleve, banen som tegnes må være lik den oppgitte formasjonen, ingen forsvarer kan havne i en annen linje enn baklinjen (wingbacks unntatt – de hører til begge), en offensiv midtbanespiller kan ikke stå på spisslinjen (da er han hengende spiss), ingen duplikate eller delvise draktnumre, og samme spiller kan ikke ha to numre i kamper under ti dager fra hverandre. Alle seks er verifisert ved å innføre feilen i en kopi av datasettet. `tests/pitch.test.ts` låser formasjonene som var feil.

**Planleggeren slipper nedgraderte kamper.** `extendSchedule` beholdt eksisterende dager, så en kamp som ble nedgradert etter at den var satt opp ble servert likevel – en datarettelse hadde altså ingen effekt på dager som allerede var fylt. Nå fjernes de, og resten av den ulåste fremtiden bygges om bak dem så det ikke blir hull i kalenderen. Låste dager røres ikke. Verifisert: 1994-kampen lå på 20.09.2026, forsvant ved nedgradering, og kalenderen ble 43 sammenhengende dager uten hull.

**Rekkevidde etter endringen:** Mangler XI 42 dager (43 kvalifiserte kamper), Målløs 32 dager.
