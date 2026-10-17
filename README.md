# Aim Tracker

Lokal Electron-app, der læser dine KovaaK's `Stats.csv`-filer og viser din fremgang i forhold til 12-ugers planen (`docs/training-program.md`).

- Appen **læser kun** fra KovaaK's-mappen. Den skriver, flytter og sletter aldrig noget dér og rører ikke spillet.
- Data gemmes i `%APPDATA%\Aim Tracker\` (database `aim-tracker.sqlite` og `settings.json`).
- Det eneste netværkskald er opdateringstjekket mod GitHub Releases. Det kan slås fra under Indstillinger.

## Kør under udvikling

```
npm install
npm start        # starter appen
npm test         # kører tests
npm run scan     # viser hvad parseren finder i din stats-mappe (gemmer intet)
npm run icon     # laver app-ikonet (PNG) ud fra src/renderer/assets/logo.svg
```

## Udgiv en ny version (auto-opdatering)

1. Ret `"version"` i `package.json` (fx `0.1.0` til `0.2.0`).
2. Commit og push:
   ```
   git commit -am "Version 0.2.0"
   git tag v0.2.0
   git push
   git push --tags
   ```
3. GitHub Actions bygger installeren og lægger den på Releases (se fanen "Actions" på GitHub).
4. Den installerede app finder den nye version ved næste opstart (eller via "Søg nu") og spørger, om den må genstarte.

Versionen i tagget skal passe med `package.json`, ellers finder appen ikke opdateringen.

## Filer

| Mappe | Indhold |
|---|---|
| `src/core/` | Parser, FOV-beregning, settings-tjek, database, plan og statistik. Ingen Electron, kan testes direkte |
| `src/main/` | Electron: vindue, mappe-overvågning, auto-opdatering |
| `src/renderer/` | Siderne (HTML/CSS/JS) og Chart.js i `vendor/` |
| `data/` | `config.json` (plan og indstillinger), Voltaic-tærskler, `targets.json` (mål for uge 4/8/12) |
| `test/` | Tests (`npm test`) |
