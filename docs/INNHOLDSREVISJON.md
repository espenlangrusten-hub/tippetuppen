# Innholdsrevisjon: Mangler XI og Finn spilleren

Telling og kvalitetskontroll av det som ligger i `main` per 2026-09-09, før nytt innhold
legges til. Målet er 365 unike dagsoppgaver per spill. Alle tall her er hentet ut av
datafilene, ikke fra hukommelsen, og kan regnes ut på nytt med `npm run data:validate`
og skriptene beskrevet nederst.

## Mangler XI

| | |
|---|---|
| Kampfiler | 54 |
| Spillbare (`verified` + `single_source`) | 51 |
| Holdt utenfor (`uncertain` 2, `recall` 1) | 3 |
| Unike dagsoppgaver | **51** (én per kamp, ingen gjenbruk) |
| Mangler til 365 | 314 |

**Årsdekning: 23 av 37 år.** Uten en eneste kamp: 1990, 1995, 1996, 1997, 1999, 2001,
2002, 2007, 2010, 2011, 2012, 2013, 2016, 2017.
Fordelt på tiår: 1990-tallet 12, 2000-tallet 13, 2010-tallet 4, 2020-tallet 25.
Skjevheten er stor nok til at et tilfeldig utvalg vil føles som «de siste årene».

**Kildenivå.** Ingen kamp mangler kilde, og 49 av 54 har to. Men fordelingen er ikke den
oppgaven krever:

| Nivå | Kamper |
|---|---|
| Har minst én primærkilde (fotball.no, UEFA, FIFA, FA, IOC, HNS) | 17 |
| Bare statistikkarkiv (RSSSF, 11v11, worldfootball, national-football-teams, soccerway) | 23 |
| Bare presse eller leksikon (ESPN, Sky, Wikipedia m.fl.) | 14 |

**37 av 54 kamper hviler ikke på noen primærkilde.** Det er ikke det samme som at de er
feil, men det er under kravet som nå gjelder, og det bør avgjøre hva som kontrolleres
først.

**Fire kamper har bare én kilde:** 1998-06-10 Marokko (`recall`), 2004-09-08 Hviterussland,
2008-10-11 Skottland, 2009-09-05 Makedonia. De tre siste er i spill på én arkivkilde.

**Draktnumre.** 19 kamper har numre. Av disse har 7 en primærkilde blant kildene sine
(fotball.no, thefa.com, uefa.com); de øvrige 12 har numrene fra presse eller arkiv. Numre
er den opplysningen som tidligere har vært feil i dette datasettet, så de bør kontrolleres
mot kampprogram eller forbundets egen oppstilling før de regnes som dokumentert.

## Finn spilleren

| | |
|---|---|
| Hintprofiler | 30 |
| Runder generatoren lager (kamp × spiller) | 292 |
| **Unike personer** | **30** |
| Mangler til 365 | 335 |

Dette er det viktigste funnet i revisjonen. Generatoren lager én runde per kamp en spiller
med profil startet, så Ørjan Nyland alene gir 22 runder. De tre biografiske hintene er de
samme hver gang; bare kamphintet varierer. Regnet som «samme person med gjenbrukte hint»
er innholdet 30 oppgaver, ikke 292. En spiller som møter Nyland fire ganger på en måned
får de samme tre hintene fire ganger.

**Kildemodellen holder ikke det nye kravet.** Kilder ligger på profilen, ikke på hintet:
19 profiler har én kilde, 11 har to, og det står ingen steder hvilken kilde som dekker
hvilket hint. Av 41 kildehenvisninger er 26 til Wikipedia; de øvrige fordeler seg på SNL
(5) og klubbenes egne sider (7), UEFA (1) og andre (2).

**Fødselsår står bare i prosaen.** 26 av 30 profiler har et fødselshint (25 med årstall,
Thomas Myhre bare med sted), men `players.json` har ikke `birthYear` for en eneste av dem.
Faktumet finnes altså ett sted, i en tekststreng, uten noe felt å krysskontrollere mot og
uten at valideringen kan se det. Det samme gjelder fødested og ungdomsklubb.

**Bare 30 av 128 startende spillere har profil.** Kampdataene inneholder allerede 128 ulike
spillere som har startet en spillbar kamp. Finn spilleren kan altså vokse betydelig uten en
eneste ny kamp – det som mangler er dokumenterte hint, ikke spillere.

## Hva som er kontrollert her, og hva som ikke er det

Kontrollert: antall, statusfordeling, årsdekning, duplikater (ingen), at alle 54 kamper har
nøyaktig elleve startende, kildeantall og kildedomener per kamp og per profil, og at hint
og register ikke motsier hverandre.

**Ikke kontrollert: om opplysningene stemmer.** Ingen av påstandene i denne revisjonen er
kontrollert mot kildeinnhold, fordi kildene ikke er tilgjengelige herfra (se under). Ingen
kamp eller profil er markert som manuelt kontrollert som følge av dette dokumentet.

## Hvorfor ingen nye oppgaver følger med denne revisjonen

Nettverkspolicyen i arbeidsmiljøet avviser CONNECT til fotball.no, uefa.com, fifa.com,
rsssf.org, en.wikipedia.org og eu-football.info. Det gjelder både `curl` og
hentverktøyet: begge svarer «blocked by the network egress proxy». Søk fungerer, men et
søketreff eller et sammendrag av en side er nettopp det oppgaven utelukker som
verifisering.

Å skrive inn startellevere fra hukommelsen og føre på en kildelenke jeg ikke har åpnet,
ville vært å merke noe som kontrollert uten å ha lest kilden. Det er ikke gjort.

Tre veier videre, i den rekkefølgen de bør prøves:

1. **Fotballdata/FIKS.** Primærkilden for norsk fotball. Handlingen «Importer NFF-kamper»
   ligger klar og mangler bare `FOTBALLDATA_CLUB_ID`, `FOTBALLDATA_CID` og `FOTBALLDATA_CWD`.
2. **Hent kildedokumentene på en runner.** En GitHub-runner når nettet. En jobb som laster
   ned og lagrer selve kildesidene i repoet gir noe som faktisk kan leses og siteres, og
   etterlater dokumentasjonen i historikken. Denne er ikke bygget: den rører delt
   infrastruktur, og skal beskrives før den lages.
3. **Kildedokumenter lastet opp manuelt.** Kampprogram, skjermbilder eller lagrede sider
   holder fint for en avgrenset batch.

## Slik regnes tallene ut på nytt

```
npm run data:validate                 # profiler, kamper, statusfordeling
node scripts/audit-content.ts         # årsdekning, kildenivå, unike oppgaver
```
