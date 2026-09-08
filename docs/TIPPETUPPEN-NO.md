# Koble tippetuppen.no til GitHub Pages

Prosjektet bygger nå URL og filstier fra den faktiske GitHub Pages-innstillingen.
Det virker både på github.io/tippetuppen og på eget domene. Ingen webhotellpakke er nødvendig.

## 1. GitHub

Åpne https://github.com/espenlangrusten-hub/tippetuppen/settings/pages og sett
**Custom domain** til `tippetuppen.no`. Lagre.

## 2. Webhuset

Domene → tippetuppen.no → DNS → DNS-oppføringer.
Erstatt eksisterende A-poster for hoveddomenet med disse fire postene:

| Type | Navn | Verdi |
| --- | --- | --- |
| A | @ (eller tomt) | 185.199.108.153 |
| A | @ (eller tomt) | 185.199.109.153 |
| A | @ (eller tomt) | 185.199.110.153 |
| A | @ (eller tomt) | 185.199.111.153 |
| CNAME | www | espenlangrusten-hub.github.io |

En eventuell gammel AAAA-post på hoveddomenet må fjernes eller erstattes med GitHubs IPv6-adresser.
Behold MX/TXT og andre poster for e-post. TTL kan stå på standard.
Bruk DNS-peking, ikke rammevideresending. CNAME-verdien skal ikke inneholde `/tippetuppen`.

## 3. Publiser og kontroller

Åpne https://github.com/espenlangrusten-hub/tippetuppen/actions/workflows/deploy.yml
og velg **Run workflow** på `main`. Bygget oppdager domenet og bruker tom base path.
Når GitHub har utstedt sertifikatet, huk av **Enforce HTTPS** under Pages.
DNS/sertifikat kan ta opptil 24 timer. Kontroller at begge domenenavnene åpner siden,
at spill, liga og innlogging virker, og at den gamle github.io-lenken videresender.

Lokal spillhistorikk og innlogging er knyttet til nettleserens domene. Logg inn på nytt
på tippetuppen.no; lagrede ligarunder ligger fortsatt på kontoen i databasen.

Kilder:
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- https://www.webhuset.no/hjelp/diverse/legge-til-endre-og-slette-dns-oppf-ringer
- https://github.com/actions/configure-pages/blob/v5/action.yml
