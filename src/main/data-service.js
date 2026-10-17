// Collects everything the pages need into one object.
// The app is small, so sending all data at once keeps the code simple.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../core/db');
const stats = require('../core/stats');
const plan = require('../core/plan');
const { cmPer360 } = require('../core/sens');
const { playlistProgress } = require('../core/playlist-progress');

const appRoot = path.join(__dirname, '..', '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(appRoot, ...parts), 'utf8'));

const config = readJson('data', 'config.json');
const thresholds = readJson('data', 'voltaic_s5_5_thresholds.json');
const targets = readJson('data', 'targets.json').targets;
const shareCodes = plan.readShareCodes(fs.readFileSync(path.join(appRoot, 'docs', 'training-program.md'), 'utf8'));

// Every share code the plan mentions. main.js caches these from kovaaks.com.
const allPlanCodes = [...new Set([...Object.values(shareCodes.adept), ...Object.values(shareCodes.benchmarks)])];

// The sens settings we show per run, and highlight when they change.
const SENS_KEYS = ['sensScale', 'sens', 'dpi'];

// Adds cm/360 to every run and marks if the sens changed since the run before.
function runsWithSens(runs) {
  let previous = null;
  return runs.map((run) => {
    const cm360 = cmPer360(run.sens, run.sensScale, run.dpi);
    const sensChanged = previous !== null && SENS_KEYS.some((key) => run[key] !== previous[key]);
    previous = run;
    return { ...run, cm360, sensChanged };
  });
}

// The plan's session template (docs/training-program.md, "Daglig session-skabelon"),
// with the playlist time filled in from the real playlist.
function sessionSteps(playlistMinutes) {
  return [
    { name: 'Opvarmning', minutes: 5, text: 'Stræk hænder, håndled, underarme, nakke og skuldre.' },
    { name: 'Below-level', minutes: 5, text: '1 til 2 lette scenarier. Fokus: lavt greb.' },
    { name: 'Skriv cue', minutes: 1, text: 'Én fokus-cue for første scenarie.' },
    { name: 'Hovedblok', minutes: playlistMinutes, text: 'Playlisten i rækkefølge. 1 til 2 min pause hver 15 til 20 min.' },
    { name: 'PB-forsøg', minutes: 5, text: 'Kun hvis du er frisk: ét scenarie tæt på næste rank.' },
    { name: 'Log', minutes: 2, text: 'Udfyld formularen herunder.' },
  ];
}

function todaysSession(today, runs, playlists) {
  const runsToday = runs.filter((run) => run.playedAt.startsWith(today.date));
  const blocks = today.codes.map((entry) => {
    const playlist = playlists[entry.code];
    return {
      ...entry,
      playlistName: playlist ? playlist.name : null,
      progress: playlist ? playlistProgress(playlist, runsToday) : null,
    };
  });
  const playlistMinutes = blocks.reduce((sum, b) => sum + (b.progress ? b.progress.estimatedMinutes : 0), 0);
  const steps = playlistMinutes > 0 ? sessionSteps(playlistMinutes) : [];
  return {
    blocks,
    steps,
    totalMinutes: steps.reduce((sum, step) => sum + step.minutes, 0),
    complete: blocks.length > 0 && blocks.every((b) => b.progress && b.progress.complete),
  };
}

function buildData(database, extra) {
  const runs = runsWithSens(db.allRuns(database));
  const summaries = stats.scenarioSummaries(runs, thresholds, targets);
  const logs = db.sessionLogs(database);
  const today = plan.todaysTraining(new Date(), config, shareCodes);

  return {
    today,
    session: todaysSession(today, runs, db.allPlaylists(database)),
    latestRun: runs[runs.length - 1] || null,
    scenarios: summaries,
    radar: stats.radarData(summaries),
    sessions: stats.groupSessions(runs, config.session_gap_minutes),
    runs: [...runs].reverse(), // newest first for the log
    problems: db.allProblems(database),
    unmatched: stats.unmatchedScenarios(runs, thresholds),
    sessionLogs: logs,
    restWarning: stats.needsRestWarning(logs),
    sessionGapMinutes: config.session_gap_minutes,
    totalWeeks: config.total_weeks,
    deloadWeeks: config.deload_weeks,
    ...extra,
  };
}

// All plan codes, with today's first (they matter most on the page).
function planCodesTodayFirst() {
  const todayCodes = plan.todaysTraining(new Date(), config, shareCodes).codes.map((c) => c.code);
  return [...new Set([...todayCodes, ...allPlanCodes])];
}

module.exports = { buildData, config, planCodesTodayFirst };
