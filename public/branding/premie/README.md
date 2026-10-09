# Trykkfil til premiekoppen (Printful, svart blank kopp 11 oz)

`kopp-trykkfil-PLASSHOLDER.png`: 2700 × 1050 px = 9 × 3,5 tommer ved 300 DPI, som er
Printfuls trykkflate for 11 oz-kopper. Svart bakgrunn (koppen er svart) og logoen én gang
på hver side av koppen (venstre og høyre halvdel). Sjekk plasseringen i Printfuls
mockup-generator før første bestilling.

**Dette er en plassholder.** Den er skalert opp fra `../tippetuppen-logo.webp` (600 × 96 px)
og blir uskarp på trykk. Så lenge `PRIZE_PRODUCT.printFileIsPlaceholder` i
`src/lib/prize.ts` er `true`, bekreftes ingen Printful-ordre automatisk – de blir liggende
som utkast til admin. Med høyoppløst logo (PNG ≥ 3000 px bred eller SVG/PDF): lag filen på
nytt med samme navn og mål, og sett flagget til `false`.
