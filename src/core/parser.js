// Parses one KovaaK's "Stats.csv" file into a plain run object.
// This file only works on text that was already read from disk, so it can
// never touch the KovaaK's folder itself. That keeps it easy to test.

// File name looks like: "<Scenario> - Challenge - 2026.10.17-12.08.07 Stats.csv".
// The scenario part is greedy because scenario names can contain " - ".
const FILE_NAME_PATTERN =
  /^(.+) - (.+?) - (\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}) Stats\.csv$/i;

// "Key:,Value" lines at the bottom of the file, e.g. "Score:,119.47".
const KEY_VALUE_PATTERN = /^([^,]+):,(.*)$/;

function parseFileName(fileName) {
  const match = FILE_NAME_PATTERN.exec(fileName);
  if (!match) return null;
  const [, scenario, mode, year, month, day, hour, minute, second] = match;
  return {
    scenario: scenario.trim(),
    mode: mode.trim(),
    // Local time without a time zone. The file has no zone info, and sorting
    // these strings alphabetically also sorts them by time.
    playedAt: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
  };
}

function readKeyValues(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const match = KEY_VALUE_PATTERN.exec(rawLine.trim());
    // Keep the first value if a key shows up twice.
    if (match && !(match[1] in values)) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

// Returns a number, or null when the field is missing or not a number.
// We never guess a value: null shows up as "-" in the app.
function toNumber(value) {
  if (value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseResolution(value) {
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(value || '');
  if (!match) return { width: null, height: null };
  return { width: Number(match[1]), height: Number(match[2]) };
}

// Returns { ok: true, run } or { ok: false, reason } (reason is Danish UI text).
function parseStatsFile(fileName, text) {
  const nameInfo = parseFileName(fileName);
  if (!nameInfo) {
    return { ok: false, reason: 'Filnavnet har ikke formatet "<Scenarie> - <Type> - ÅÅÅÅ.MM.DD-TT.MM.SS Stats.csv"' };
  }

  const values = readKeyValues(text);
  const score = toNumber(values['Score']);
  if (score === null) {
    return { ok: false, reason: 'Fandt ingen gyldig "Score:"-linje (filen er måske ikke færdigskrevet)' };
  }

  const hits = toNumber(values['Hit Count']);
  const misses = toNumber(values['Miss Count']);
  const { width, height } = parseResolution(values['Resolution']);

  return {
    ok: true,
    run: {
      fileName,
      // Prefer the name inside the file. The file name can differ, e.g. when
      // Windows does not allow a character from the scenario name.
      scenario: values['Scenario'] || nameInfo.scenario,
      mode: nameInfo.mode,
      playedAt: nameInfo.playedAt,
      score,
      kills: toNumber(values['Kills']),
      hits,
      misses,
      accuracy: hits !== null && misses !== null && hits + misses > 0 ? hits / (hits + misses) : null,
      sensScale: values['Sens Scale'] || null,
      sens: toNumber(values['Horiz Sens']),
      vertSens: toNumber(values['Vert Sens']),
      dpi: toNumber(values['DPI']),
      fov: toNumber(values['FOV']),
      fovScale: values['FOVScale'] || null,
      resolution: values['Resolution'] || null,
      width,
      height,
      avgFps: toNumber(values['Avg FPS']),
      gameVersion: values['Game Version'] || null,
    },
  };
}

module.exports = { parseStatsFile, parseFileName };
