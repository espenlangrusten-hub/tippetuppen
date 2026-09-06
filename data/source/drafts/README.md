# Utkast

Filene her er **ikke i spill**. `loadDataset` leser bare `../matches`, så ingenting herfra
kan havne i rotasjonen ved et uhell.

De skrives av GitHub-handlingen **Importer kamper** (`scripts/import/wikipedia.ts`), som
henter kampen fra Wikipedia. Kilden er pålitelig på navn, dato, resultat, arena og
målscorere – og grov på alt annet.

## Før du flytter en fil til `../matches`

1. **Behold det kilden faktisk sier.** Wikipedia oppgir ofte bare GK/DF/MF/FW. Da
   beholdes de generiske posisjonene i stedet for at importøren finner på venstre,
   høyre eller sentral rolle. Formasjonen er utledet av kildens egne DF/MF/FW-tall.
2. **Draktnumre er utelatt med vilje.** Legg dem inn bare fra en kilde som faktisk viser
   dem, og skriv det i kildenotatet. Ukontrollerte numre er det som ga åtte spillere feil
   drakt i november-2025-kampene.
3. **Sjekk status.** `uncertain` betyr at importøren ikke fant elleve startende.
4. **Fjern `notes`-teksten** som begynner med «UTKAST» når gjennomgangen er gjort.
   Generiske posisjoner kan publiseres hvis kilden ikke er mer presis.

Så: `npm run data:validate` grønn, og kjør **Oppdater data**.
