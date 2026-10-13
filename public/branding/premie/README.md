# Trykkfil til premiekoppen (Printful, svart blank kopp 11 oz)

`kopp-trykkfil.png`: 2700 × 1050 px = 9 × 3,5 tommer ved 300 DPI, Printfuls trykkflate for
11 oz-kopper. Svart bakgrunn og logoen én gang på hver side av koppen (venstre og høyre halvdel).
Laget fra den høyoppløste logoen `../tippetuppen-logo-hires.png` (4800 × 954 px), med svart
skrift og ballkontur gjort hvit så den synes på svart kopp; stripene har originalfargene.
Sjekk plasseringen i Printfuls mockup-generator før første bestilling.

`PRIZE_PRODUCT.printFileIsPlaceholder` i `src/lib/prize.ts` står fortsatt på `true`, så ingen
Printful-ordre bekreftes automatisk før Espen har godkjent trykkfilen. Sett den til `false` da.

## Bilde av premien på forsiden

`kopp-illustrasjon.webp` er en **illustrasjon** tegnet i kode (svart kopp + den nye logoen), ikke
en mockup fra Printful, og er merket slik i selve bildet.
