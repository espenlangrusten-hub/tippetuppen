# Utkast

Filene her er **ikke i spill**. `loadDataset` leser bare `../matches`, så ingenting herfra
kan havne i rotasjonen ved et uhell.

De skrives av GitHub-handlingen **Importer kamper** (`scripts/import/wikipedia.ts`), som
henter kampen fra Wikipedia. Kilden er pålitelig på navn, dato, resultat, arena og
målscorere – og grov på alt annet.

## Før du flytter en fil til `../matches`

1. **Sett venstre og høyre.** Wikipedia oppgir bare GK/DF/MF/FW, så alle forsvarere kommer
   som `CB` og alle midtbanespillere som `CM`. Formasjonen er utledet av kildens egne
   DF/MF/FW-tall, så antallet i hver rekke stemmer, men sidene må settes for hånd.
2. **Draktnumre er utelatt med vilje.** Legg dem inn bare fra en kilde som faktisk viser
   dem, og skriv det i kildenotatet. Ukontrollerte numre er det som ga åtte spillere feil
   drakt i november-2025-kampene.
3. **Sjekk status.** `uncertain` betyr at importøren ikke fant elleve startende.
4. **Fjern `notes`-teksten** som begynner med «UTKAST» når gjennomgangen er gjort.

Så: `npm run data:validate` grønn, og kjør **Oppdater data**.
