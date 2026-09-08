# Driftsveiledning (runbook)

Alt kjører på GitHub og Supabase.

## 1. Supabase

Prosjektet `dommer` gjenbrukes. Tippetuppen ligger i sitt eget skjema `tippetuppen`, så det kolliderer ikke med de andre tabellene.

Databaseskjemaet er allerede opprettet. Skal du sette opp et nytt prosjekt fra bunnen: kjør SQL-en i `drizzle/0000_init.sql` i Supabase SQL Editor.

**Hemmeligheter for Edge-funksjonen** (Supabase → Edge Functions → Secrets):

| Navn | Verdi |
| --- | --- |
| `ADMIN_KEY` | Lang tilfeldig streng. Låser opp `/admin` og admin-rutene. |
| `ANALYTICS_SALT` | Tilfeldig streng for den daglige anonyme besøksnøkkelen. |
| `DB_URL` | Valgfritt. Sett til «Transaction pooler»-URL-en hvis funksjonen får mye trafikk. |

`SUPABASE_DB_URL` settes automatisk av Supabase.

## 2. GitHub

**Repoet må være offentlig**, ellers krever GitHub Pages en betalt plan (GitHub Pro). Settings → Pages → Source: **GitHub Actions**.

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Navn | Verdi |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Personlig token fra supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | Prosjekt-ref-en (den i URL-en til prosjektet) |
| `DATABASE_URL` | Supabase → Settings → Database → Transaction pooler |
| `FOTBALLDATA_CLUB_ID` | NFF/Fotballdata-avtalens `clubId` |
| `FOTBALLDATA_CID` | NFF/Fotballdata-avtalens `cid` |
| `FOTBALLDATA_CWD` | NFF/Fotballdata-avtalens `cwd` |

**Variables** (samme side, fanen Variables):

| Navn | Eksempel |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://<bruker>.github.io/tippetuppen` |
| `NEXT_PUBLIC_BASE_PATH` | `/tippetuppen` (tom ved eget domene) |
| `NEXT_PUBLIC_API_URL` | `https://<ref>.supabase.co/functions/v1/api` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (offentlig nøkkel) |
| `NEXT_PUBLIC_ADSENSE_CLIENT` m.fl. | Valgfritt, se under |

## 3. Første gangs oppsett

1. Gjør repoet offentlig og slå på Pages med kilde «GitHub Actions».
2. Legg inn secrets og variables over.
3. Kjør handlingen **Oppdater data** (Actions → Oppdater data → Run workflow). Den validerer kildedataene, kjører migrasjoner, importerer dataene og planlegger 400 dager.
4. Push til `main` (eller kjør **Deploy** manuelt). Den publiserer nettstedet og ruller ut Edge-funksjonen.
5. Åpne nettstedet. Begge spillene skal vise dagens utgave.

## 4. Daglig drift

Ingenting må gjøres daglig. Planen ligger i databasen, og **Oppdater data** kjører automatisk hver mandag og fyller på.

- **Legge til kamper:** lag en fil i `data/source/matches/`, push, og kjør **Oppdater data**. Kravene er 11 startere, én keeper, kilde-URL og status.
- **Legge til mange landskamper:** kjør GitHub-handlingen **Importer NFF-kamper**. Første fulle kjøring bruker fiksId `39899`, fra `1990-01-01` til `2026-12-31`. Komplette ellevere foreslås i en pull request; ufullstendige svar legges i `data/source/drafts/fotballdata-review/` og kommer aldri inn i spillet.
- **Wikipedia-reserve:** handlingen **Importer kamper** kan hente utkast fra konkrete Wikipedia-sider. Generiske GK/DF/MF/FW-posisjoner beholdes som generiske; importøren dikter ikke side eller detaljrolle. Les `data/source/drafts/README.md` før en fil flyttes til `matches/`.
- **Rette data:** endre JSON-filene i `data/source/`, push, kjør **Oppdater data**. Alt er versjonskontrollert.
- **Bytte ut eller skru av et puslespill:** åpne `/admin` på nettstedet, lim inn `ADMIN_KEY`, og bruk knappene. Endringer gjelder umiddelbart.
- **Innholdsrekkevidde:** `/admin` viser hvor mange dager som er planlagt framover. Nærmer det seg 30, legg til flere kamper.
- **Besøkstall:** `/admin` viser sidevisninger, spill startet og fullført, delinger, fordeling per spill og de siste 30 dagene. Merk at besøkskoden roterer hver natt, med vilje – «besøkende» gjelder derfor bare den enkelte dagen og kan ikke summeres til et antall personer.

### Fotballdata (NFF)

NFF eier dataene i FIKS, og bruk krever avtale med dem. Med avtalen på plass gir Fotballdata
deg tre nøkler: `clubId`, `cid` og `cwd`. Legg dem inn som repository secrets
`FOTBALLDATA_CLUB_ID`, `FOTBALLDATA_CID` og `FOTBALLDATA_CWD`.

Kjør handlingen **Importer NFF-kamper** med turneringens fiksId (39899 er «Norge Menn
Senior A» på fotball.no), dato fra `1990-01-01` og dato til `2026-12-31`. Importøren:

1. leser både innpakket `Matches`-respons og eldre array-respons;
2. henter kampdetaljer sekvensielt med pause og retry;
3. krever nøyaktig elleve startere, én keeper, gyldig resultat og dokumentert kilde;
4. beholder generiske DF/MF/FW-posisjoner hvis NFF ikke oppgir en mer presis rolle;
5. fjerner kontaktfelt i minnet før noe skrives;
6. lar eksisterende håndkuraterte kampfiler stå urørt.

Handlingen åpner en pull request. Se gjennom antall kamper, periode og eventuelle filer i
`fotballdata-review`, slå sammen PR-en, og kjør deretter **Oppdater data**. Dette skiller
innhenting fra produksjonssetting og gjør at en endring i API-formatet ikke kan publisere
feil oppstillinger automatisk.

### Starte en jobb uten å trykke på knappen

**Hent spillerbilder** kan også startes ved å pushe til grenen `kjør/hent-bilder`. Grenen
inneholder ingen kode – jobben henter alltid ut standardgrenen – og finnes bare fordi en
push er noe assistenten som jobber i repoet kan gjøre, mens den ikke får starte en workflow.
Pushen utløser ikke CI.

Vil du starte den selv, er knappen under **Actions → Hent spillerbilder** fortsatt der, og der
kan du også styre `limit` og `width`. Ved push brukes standardverdiene: tre bilder, 900 piksler.

**Oppdater data** trenger ingenting av dette – den går automatisk når noe i `data/source/`,
`drizzle/`, `scripts/schedule.ts` eller `src/server/puzzles/` endres på `main`.

## 5. Eget domene

GitHub Pages støtter eget domene gratis, også med HTTPS.

1. Kjøp domenet hos en registrar (Domeneshop, domene.no, Namecheap …).
2. Hos registraren, sett DNS:
   - **Toppdomene** (`tippetuppen.no`): fire A-poster til `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - **www**: én CNAME-post til `espenlangrusten-hub.github.io`.
3. GitHub → Settings → Pages → *Custom domain* → skriv inn domenet → Save. Huk av **Enforce HTTPS** når sertifikatet er klart (kan ta en time).
4. Endre GitHub-variablene:
   - `NEXT_PUBLIC_SITE_URL` = `https://tippetuppen.no`
   - `NEXT_PUBLIC_BASE_PATH` = **slett variabelen** (den skal være tom uten `github.io`)
5. Kjør Deploy.

Ved utrulling fra GitHub Actions trengs ingen CNAME-fil i repoet – GitHub ignorerer den og bruker innstillingen. Deploy stopper med en tydelig feilmelding hvis `NEXT_PUBLIC_BASE_PATH` og domenet ikke henger sammen.

## 6. Annonser (AdSense)

1. Legg til nettstedet i AdSense.
2. Sett variabelen `NEXT_PUBLIC_ADSENSE_CLIENT` til `ca-pub-…` og deploy. Da genereres også `/ads.txt`, som Google krever. Sjekk at den svarer.
3. Slå på «Privacy & messaging» i AdSense (Googles sertifiserte CMP, påkrevd for personlige annonser i EØS) og sett `NEXT_PUBLIC_CMP=funding-choices`.
4. Etter godkjenning: opprett annonseenheter og legg slot-ID-ene i `NEXT_PUBLIC_ADSENSE_SLOT_*`.

## 7. Feilsøking

- **«Fikk ikke kontakt»** på spillsiden: Edge-funksjonen svarer ikke. Sjekk Supabase → Edge Functions → Logs, og at `NEXT_PUBLIC_API_URL` peker riktig.
- **«Ikke klart ennå»:** ingen plan for dagens Oslo-dato. Kjør **Oppdater data**.
- **401 i admin:** feil `ADMIN_KEY`, eller hemmeligheten er ikke satt på funksjonen.
- **Pages viser 404:** `NEXT_PUBLIC_BASE_PATH` må være `/<repo>` når nettstedet ligger på `github.io`.
- **Lokalt:** `npm run dev:stack` starter Postgres-protokollen og funksjonen; loggene ligger i `.data/dev/`.
