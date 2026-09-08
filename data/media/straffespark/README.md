# Filer til Straffespark

Her ligger bildene og lydklippene spørsmålene peker på. Mappa er tom til du legger noe her.

Et spørsmål i `data/source/straffespark.json` står med `"enabled": false` så lenge fila mangler.
`npm run data:validate` nekter å godkjenne et spørsmål som er skrudd på og peker på en fil som
ikke finnes – da ville spilleren fått et blankt spørsmål.

## Bilder (spørsmål 1: gjett spilleren)

- **Filnavn:** akkurat det som står i `image.file`, for eksempel `erling-haaland-2017.jpg`
- **Format:** JPG eller PNG, minst 800 px på korteste side, gjerne ansiktet nær midten
- **Motiv:** spilleren i norsk klubbfotball mellom 1990 og 2026

Legg inn det skarpe bildet. Uskarpheten lages i spillet, ikke i fila – da kan vi styre hvor mye
som avsløres for hvert forsøk, og vise bildet skarpt til slutt.

## Lyd (spørsmål 5: gjett laget)

- **Filnavn:** det som står i `audio.file`, for eksempel `eksempel-brann.mp3`
- **Format:** MP3 eller M4A, 5–15 sekunder, normalisert lydstyrke

## Rettigheter – dette må fylles ut

Hvert bilde og lydklipp har `credit` og `licence` i JSON-fila. Begge må fylles ut før spørsmålet
kan skrus på; validering stopper alt som fortsatt står som `TODO`.

- `credit` – hvem som har tatt bildet eller gjort opptaket
- `licence` – for eksempel `CC BY-SA 4.0`, `eget opptak`, eller `skriftlig tillatelse fra klubben`

Pressebilder og supportersang er som regel vernet. Bruk egne opptak, bilder med fri lisens, eller
noe du har fått lov til å bruke. Siden er annonsefinansiert, så «funnet på nett» holder ikke.
