# Aim Tracker

Lokal Electron-app, der læser dine KovaaK's `Stats.csv`-filer og hjælper dig med din aim-træning: scenarier, ranks, radar over dine svagheder, sessioner, cm/360 pr. run, træningsprogrammer du kan følge pas for pas, og en lokal AI-coach.

- Appen **læser kun** fra KovaaK's-mappen. Den skriver, flytter og sletter aldrig noget dér og rører ikke spillet.
- "Åbn i KovaaK's"-knapperne bruger KovaaK's' officielle `steam://`-links.
- Data gemmes i `%APPDATA%\Aim Tracker\` (database `aim-tracker.sqlite` og `settings.json`).
- Netværk: kun opdateringer fra GitHub Releases, opslag af playlister på kovaaks.com, og Ollama på 127.0.0.1. Der sendes ingen data om dig.

## Coach (lokal AI)

Coach-siden svarer på spørgsmål om din træning ud fra kilder, du selv tilføjer (noter, research, video-transskripter) plus dine egne tal. Den kører på [Ollama](https://ollama.com/download), som kører modellerne lokalt på din egen maskine.

Appen guider dig gennem opsætningen i tre trin (installér, start, hent modeller) og kan hente modellerne for dig. Standardmodeller: `nomic-embed-text` til søgning og `qwen2.5:14b` til svar. De kan ændres i `settings.json` i `%APPDATA%\Aim Tracker\`.

Dine kilder og samtaler bliver kun gemt lokalt i appens database.

## Kør under udvikling

```
npm install
npm start        # starter appen
npm test         # kører tests
npm run scan     # viser hvad parseren finder i din stats-mappe (gemmer intet)
npm run icon     # laver app-ikonet (PNG) ud fra src/renderer/assets/logo.svg
```

## Sådan virker opdateringer

Windows Smart App Control blokerer nye installere, der ikke er signeret. Derfor opdaterer appen kun sin **kode**:

1. Hver release på GitHub har `app-x.y.z.asar` (appens kode) og `app-update.json` (version og SHA-512-checksum).
2. Den installerede app henter kodefilen, tjekker checksummen og gemmer den i `%APPDATA%\Aim Tracker\code-updates\`.
3. Ved næste start vælger `src/main/bootstrap.js` den nyeste kode. Selve `.exe`-filen bliver den samme.

Kræver en ny version en anden Electron-version, skal den installeres med installeren i stedet. Det siger appen selv.

## Udgiv en ny version

1. Ret `"version"` i `package.json` (fx `0.5.0` til `0.6.0`).
2. Commit, tag og push:
   ```
   git commit -am "Version 0.6.0"
   git tag v0.6.0
   git push
   git push origin v0.6.0
   ```
3. GitHub Actions bygger installeren og kodefilen og lægger dem på Releases.

Versionen i tagget skal passe med `package.json`.

## Filer

| Mappe | Indhold |
|---|---|
| `src/core/` | Parser, cm/360, database, plan, program, "Følg planen", statistik, opdateringsregler og Coach-logik (chunking, søgning). Ingen Electron, kan testes direkte |
| `src/main/` | Electron: bootstrap, vindue, mappe-overvågning, kovaaks.com-opslag, opdatering, Ollama og Coach |
| `src/renderer/` | Siderne (HTML/CSS/JS) og Chart.js i `vendor/` |
| `data/` | `config.json`, Voltaic S5.5- og Viscose-tærskler, `targets.json` (mål for uge 4/8/12), `program.json` (det program du følger lige nu) |
| `test/` | Tests (`npm test`) |
