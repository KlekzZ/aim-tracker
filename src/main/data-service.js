// Collects everything the pages need into one object.
// The app is small, so sending all data at once keeps the code simple.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../core/db');
const stats = require('../core/stats');
const plan = require('../core/plan');
const { checkRunSettings } = require('../core/settings-check');

const appRoot = path.join(__dirname, '..', '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(appRoot, ...parts), 'utf8'));

const config = readJson('data', 'config.json');
const thresholds = readJson('data', 'voltaic_s5_thresholds.json');
const targets = readJson('data', 'targets.json').targets;
const shareCodes = plan.readShareCodes(fs.readFileSync(path.join(appRoot, 'docs', 'training-program.md'), 'utf8'));

// The settings we show per run, and want to highlight when they change.
const SETTING_KEYS = ['sensScale', 'sens', 'dpi', 'fov', 'fovScale', 'resolution'];

// Adds warnings to every run, and marks which settings changed compared
// to the run before it. Warnings are worked out here (not at import), so
// they follow data/config.json if the plan settings change.
function runsWithChecks(runs) {
  let previous = null;
  return runs.map((run) => {
    const { horizontalFov, warnings } = checkRunSettings(run, config.expected_settings);
    const changed = previous ? SETTING_KEYS.filter((key) => run[key] !== previous[key]) : [];
    previous = run;
    return { ...run, horizontalFov, warnings, changed };
  });
}

function buildData(database, extra) {
  const runs = runsWithChecks(db.allRuns(database));
  const summaries = stats.scenarioSummaries(runs, thresholds, targets);
  const logs = db.sessionLogs(database);

  return {
    today: plan.todaysTraining(new Date(), config, shareCodes),
    latestRun: runs[runs.length - 1] || null,
    scenarios: summaries,
    radar: stats.radarData(summaries),
    sessions: stats.groupSessions(runs, config.session_gap_minutes),
    runs: [...runs].reverse(), // newest first for the log
    problems: db.allProblems(database),
    unmatched: stats.unmatchedScenarios(runs, thresholds),
    sessionLogs: logs,
    restWarning: stats.needsRestWarning(logs),
    expectedSettings: config.expected_settings,
    sessionGapMinutes: config.session_gap_minutes,
    ...extra,
  };
}

module.exports = { buildData, config };
