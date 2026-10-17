// Everything about "where am I in the 12-week plan today".
// Share codes are read from docs/training-program.md (the source of truth),
// so if the plan file changes, the app follows without code changes.

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_DA = {
  Mon: 'mandag', Tue: 'tirsdag', Wed: 'onsdag', Thu: 'torsdag',
  Fri: 'fredag', Sat: 'lørdag', Sun: 'søndag',
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "2026-10-19" -> a Date at local midnight. Plain new Date("2026-10-19")
// would be UTC midnight and can land on the wrong day.
function localDate(isoDay) {
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isoDay(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Returns the rows of the first markdown table after a heading that starts
// with headingStart. Each row is an array of cell texts.
function tableAfterHeading(markdown, headingStart) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#+\s/.test(line) && line.replace(/^#+\s*/, '').startsWith(headingStart));
  if (start === -1) return [];

  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) break; // next section
    if (!line.startsWith('|')) {
      if (rows.length > 0) break; // the table has ended
      continue;
    }
    const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.every((cell) => /^-*$/.test(cell))) continue; // the |---| line
    rows.push(cells);
  }
  return rows.slice(1); // drop the header row
}

const stripCode = (cell) => cell.replace(/`/g, '').trim();

// { "Tracking I": "KovaaKs...", ... } plus the benchmark codes we use.
function readShareCodes(markdown) {
  const adept = {};
  for (const [routine, code] of tableAfterHeading(markdown, 'Share codes: VDIM Adept')) {
    adept[routine] = stripCode(code);
  }
  const benchmarks = {};
  for (const [playlist, code] of tableAfterHeading(markdown, 'Share codes: benchmarks')) {
    benchmarks[playlist] = stripCode(code);
  }
  return { adept, benchmarks };
}

function planWeek(today, config) {
  const week1 = localDate(config.plan_week1_start);
  const week0 = localDate(config.week0_start);
  if (today < week0) return { week: null, label: 'Planen er ikke startet endnu' };
  if (today < week1) return { week: 0, label: 'Uge 0: opstart, indstillinger og baseline' };

  const days = Math.round((today - week1) / MS_PER_DAY);
  const week = Math.floor(days / 7) + 1;
  if (week > config.total_weeks) return { week, label: `Planen sluttede efter uge ${config.total_weeks}` };

  const block = Math.ceil(week / 4);
  const deload = config.deload_weeks.includes(week);
  return {
    week,
    block,
    deload,
    label: deload ? `Uge ${week} (blok ${block}): deload, 50 % volumen` : `Uge ${week} (blok ${block})`,
  };
}

// Picks today's routine from the weekly schedule and finds its share code.
function todaysTraining(today, config, shareCodes) {
  const dayKey = DAY_KEYS[today.getDay()];
  const weekInfo = planWeek(today, config);
  let scheduleText = config.weekly_schedule[dayKey];
  const codes = [];

  if (weekInfo.week === 0) {
    // The plan's week 0: settings, then play S5.5 Intermediate and Viscose
    // Medium once each as a baseline. The weekly schedule starts in week 1.
    scheduleText = 'Opstart: indstillinger, S5.5 Intermediate én gang og Viscose Medium én gang';
    for (const name of ['Voltaic S5.5 Intermediate', 'Viscose S1 Medium']) {
      if (shareCodes.benchmarks[name]) codes.push({ name: `${name} (baseline)`, code: shareCodes.benchmarks[name] });
    }
  } else if (weekInfo.week === null || weekInfo.week > config.total_weeks) {
    // Outside the plan: show the weekday schedule but no codes.
  } else if (scheduleText.startsWith('VDIM Adept')) {
    let routine = scheduleText.replace('VDIM Adept ', '');
    if (routine.startsWith('Clicking')) {
      // The plan: Clicking I in odd weeks, Clicking II in even weeks.
      routine = weekInfo.week % 2 === 1 ? 'Clicking I' : 'Clicking II';
    }
    const code = shareCodes.adept[routine];
    if (code) codes.push({ name: `VDIM Adept ${routine}`, code });
  } else if (scheduleText.startsWith('Viscose')) {
    for (const name of ['Viscose S1 Easier', 'Viscose S1 Medium']) {
      if (shareCodes.benchmarks[name]) codes.push({ name, code: shareCodes.benchmarks[name] });
    }
  }

  return {
    date: isoDay(today),
    dayName: DAY_NAMES_DA[dayKey],
    schedule: scheduleText,
    weekInfo,
    codes,
  };
}

module.exports = { planWeek, todaysTraining, readShareCodes, tableAfterHeading, localDate, isoDay };
