// Builds data/viscose_thresholds.json from Viscose's public benchmark sheet.
// Run by hand when the sheet changes:  npm run import-viscose
// (The app itself never talks to Google. It only reads the saved file.)
const fs = require('node:fs');
const path = require('node:path');

const SHEET = '1bFAlt6g_Gm8P9RBkcAoObpbIGFwVS5gXIdIK9B_YyZE';
const TABS = [
  { id: 'easier', name: 'Viscose Easier', gid: '175037510', referenceRank: 'Mammoth' },
  { id: 'medium', name: 'Viscose Medium', gid: '664688517', referenceRank: 'Cinnabar' },
  { id: 'hard', name: 'Viscose Hard', gid: '734094475', referenceRank: 'Wool' },
];
// The sheet and the game disagree on a few names. KovaaK's writes the game's
// name in every Stats.csv, so we use the game's spelling (checked against the
// playlists on kovaaks.com on 2026-10-17).
const NAME_FIXES = {
  'VT Controlsphere Intermediate Hard': 'VT Controlsphere Intermediate S5 Hard',
};
// Viscose's rule: Fingertip scenarios are only valid at 50 cm/360 or faster.
const FINGERTIP_MAX_CM360 = 50;

// Small CSV reader: handles "quoted, values" and "" inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function toNumber(value) {
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) && String(value).trim() !== '' ? number : null;
}

function parseTab(tab, csv) {
  const rows = parseCsv(csv);
  const title = rows[0][0];
  const code = (rows[0].find((cell) => /^KovaaKs[A-Za-z]+$/.test(cell.trim())) || '').trim();

  // Row 2 is the header: "Scenario ... Progress, <rank 1>, <rank 2>, ... , (empty)".
  const header = rows[1];
  const first = header.indexOf('Progress') + 1;
  const ranks = [];
  for (let i = first; i < header.length && header[i].trim() !== ''; i++) ranks.push(header[i].trim());

  const scenarios = [];
  let category = '';
  let subcategory = '';
  for (const row of rows.slice(2)) {
    if (row[0].trim()) category = row[0].trim();
    if (row[1].trim()) subcategory = row[1].trim();
    const sheetName = (row[2] || '').trim();
    if (!sheetName) continue;
    const name = NAME_FIXES[sheetName] || sheetName;

    const thresholds = ranks.map((_, i) => toNumber(row[first + i]));
    if (thresholds.some((t) => t === null) || thresholds.some((t, i) => i > 0 && t <= thresholds[i - 1])) {
      throw new Error(`${tab.name}: strange thresholds for "${name}": ${thresholds.join(', ')}`);
    }
    const scenario = { name, category, subcategory, thresholds };
    if (subcategory === 'Fingertip') scenario.max_cm360 = FINGERTIP_MAX_CM360;
    scenarios.push(scenario);
  }
  if (!code || ranks.length < 4 || scenarios.length < 20) throw new Error(`${tab.name}: the sheet layout has changed (${title})`);

  return { id: tab.id, name: tab.name, share_code: code, ranks, reference_rank: tab.referenceRank, scenarios };
}

async function main() {
  const benchmarks = [];
  for (const tab of TABS) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${tab.gid}`);
    if (!response.ok) throw new Error(`${tab.name}: HTTP ${response.status}`);
    benchmarks.push(parseTab(tab, await response.text()));
  }
  const file = {
    _note: `Thresholds copied from the Viscose Benchmarks sheet (https://docs.google.com/spreadsheets/d/${SHEET}) by scripts/import-viscose.js. reference_rank is the rank the radar measures against (Mammoth is the goal in the plan; Medium and Hard use their first rank). max_cm360: Viscose says Fingertip scores are invalid slower than 50 cm/360.`,
    source: 'Viscose Benchmarks S1 (sheet)',
    benchmarks,
  };
  const out = path.join(__dirname, '..', 'data', 'viscose_thresholds.json');
  fs.writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
  for (const b of benchmarks) console.log(`${b.name}: ${b.scenarios.length} scenarios, ${b.ranks.length} ranks (${b.ranks[0]} ... ${b.ranks[b.ranks.length - 1]}), code ${b.share_code}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
