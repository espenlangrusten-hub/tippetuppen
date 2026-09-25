# Fotballkoblinger

100 faste dagsbrett med 16 norske landslagsspillere og fire koblinger per brett.
Hver kobling dokumenterer at fire spillere startet en bestemt landskamp, eller
at de startet **begge** to angitte landskamper. De 400 koblingene og alle brettene
ligger i `data/source/fotballkoblinger.json`. Hvert brett bruker fire ulike
koblinger, og ingen kobling går igjen i de 100 brettene.

Kildene er kampfilene i `data/source/matches`. Generatoren
`python scripts/build-connections.py` bruker bare kamper med komplett ellever,
minst én angitt kildelenke og status `verified`/`single_source`. Den avviser
brett hvor et av de 16 navnene passer i flere enn én av dagens fire koblinger.
Kjører man generatoren etter å ha oppdatert kampfilene, skal endringene gjennom
redaksjonell kontroll før ny JSON legges inn i dagskalenderen. Særlig koblinger
som krever to kamper, bør leses for vanskelighetsgrad og formulering.

`npm run db:migrate` oppretter separate `connection_groups` og
`connection_attempts` i `tippetuppen`-skjemaet. Begge har RLS uten direkte
lesepolicy for nettleserrollen. `npm run data:schedule` skriver 400 koblinger
til banken, oppretter 100 oppgaver og fyller kalenderen. Publiserte oppgaver
oppdateres ikke ved senere datakjøringer. API-et returnerer kortene, men holder
fasit og kildehenvisninger tilbake til en gruppe er løst eller forsøket er over.

Poeng: 25 per funnet gruppe, maksimalt 100. Fire feil avslutter runden. Det er
ett tellende forsøk per konto og dag, lagret på serveren. Gjester får en lokal
forsøks-ID. Dagen skifter ved midnatt i Oslo.

Kontroll: `npm test`, `npm run typecheck`, `npm run check:deno`, `npm run build`.
En isolert lokal databaseprøve kjøres med
`PGLITE_MEMORY=1 node --import tsx scripts/check-connections.ts`.
