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
- **Rette data:** endre JSON-filene i `data/source/`, push, kjør **Oppdater data**. Alt er versjonskontrollert.
- **Bytte ut eller skru av et puslespill:** åpne `/admin` på nettstedet, lim inn `ADMIN_KEY`, og bruk knappene. Endringer gjelder umiddelbart.
- **Innholdsrekkevidde:** `/admin` viser hvor mange dager som er planlagt framover. Nærmer det seg 30, legg til flere kamper.

## 5. Annonser (AdSense)

1. Legg til nettstedet i AdSense.
2. Sett variabelen `NEXT_PUBLIC_ADSENSE_CLIENT` til `ca-pub-…` og deploy. Da genereres også `/ads.txt`, som Google krever. Sjekk at den svarer.
3. Slå på «Privacy & messaging» i AdSense (Googles sertifiserte CMP, påkrevd for personlige annonser i EØS) og sett `NEXT_PUBLIC_CMP=funding-choices`.
4. Etter godkjenning: opprett annonseenheter og legg slot-ID-ene i `NEXT_PUBLIC_ADSENSE_SLOT_*`.

## 6. Feilsøking

- **«Fikk ikke kontakt»** på spillsiden: Edge-funksjonen svarer ikke. Sjekk Supabase → Edge Functions → Logs, og at `NEXT_PUBLIC_API_URL` peker riktig.
- **«Ikke klart ennå»:** ingen plan for dagens Oslo-dato. Kjør **Oppdater data**.
- **401 i admin:** feil `ADMIN_KEY`, eller hemmeligheten er ikke satt på funksjonen.
- **Pages viser 404:** `NEXT_PUBLIC_BASE_PATH` må være `/<repo>` når nettstedet ligger på `github.io`.
- **Lokalt:** `npm run dev:stack` starter Postgres-protokollen og funksjonen; loggene ligger i `.data/dev/`.
