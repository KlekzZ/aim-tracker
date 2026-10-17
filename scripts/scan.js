// Prints what the parser finds in a stats folder. Read-only, stores nothing.
// Usage: npm run scan              (uses the folder from data/config.json)
//        npm run scan -- "C:\other\folder"
const fs = require('node:fs');
const path = require('node:path');
const { parseStatsFile } = require('../src/core/parser');
const { cmPer360 } = require('../src/core/sens');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config.json'), 'utf8'));
const statsDir = process.argv[2] || config.default_stats_dir_windows;

console.log(`Mappe: ${statsDir}\n`);
const files = fs.readdirSync(statsDir).filter((name) => /Stats\.csv$/i.test(name));
console.log(`Fandt ${files.length} Stats.csv-filer\n`);

for (const fileName of files) {
  const result = parseStatsFile(fileName, fs.readFileSync(path.join(statsDir, fileName), 'utf8'));
  if (!result.ok) {
    console.log(`PROBLEM  ${fileName}\n         ${result.reason}`);
    continue;
  }
  const run = result.run;
  const cm = cmPer360(run.sens, run.sensScale, run.dpi);
  console.log(`${run.playedAt}  ${run.scenario}  [${run.mode}]  score ${run.score}`);
  console.log(`         ${run.sensScale} ${run.sens} @ ${run.dpi} DPI -> ${cm === null ? '?' : cm} cm/360`);
}
