// Collects everything the pages need into one object.
// The app is small, so sending all data at once keeps the code simple.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../core/db');
const stats = require('../core/stats');
const plan = require('../core/plan');
const program = require('../core/program');
const follow = require('../core/follow');
const coachPlan = require('../core/coach-plan');
const { cmPer360 } = require('../core/sens');

const appRoot = path.join(__dirname, '..', '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(appRoot, ...parts), 'utf8'));

const config = readJson('data', 'config.json');
const thresholds = readJson('data', 'voltaic_s5_5_thresholds.json');
const viscose = readJson('data', 'viscose_thresholds.json');
const targets = readJson('data', 'targets.json').targets;
const programData = readJson('data', 'program.json');
const builtInPasses = program.buildPasses(programData);
const shareCodes = plan.readShareCodes(fs.readFileSync(path.join(appRoot, 'docs', 'training-program.md'), 'utf8'));

// The passes you are actually following: a programme the coach made and you
// accepted (stored in the database), or the built-in 12-week plan.
function activeProgram(database) {
  return db.getState(database, 'program');
}
function currentPasses(database) {
  const generated = activeProgram(database);
  return generated && generated.passes.length ? generated.passes : builtInPasses;
}

// Every share code the plan and the programmes use. main.js caches these from kovaaks.com.
const allPlanCodes = [...new Set([
  ...Object.values(shareCodes.adept),
  ...Object.values(shareCodes.benchmarks),
  ...builtInPasses.flatMap((pass) => pass.parts.filter((p) => p.kind === 'playlist').map((p) => p.code)),
  ...viscose.benchmarks.map((b) => b.share_code),
])];

// Scenarios where Viscose requires a fast sens (Fingertip), by normalized name.
const normalizeName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const fingertipMax = new Map(viscose.benchmarks.flatMap((b) => b.scenarios
  .filter((s) => s.max_cm360).map((s) => [normalizeName(s.name), s.max_cm360])));

// The sens settings we show per run, and highlight when they change.
const SENS_KEYS = ['sensScale', 'sens', 'dpi'];

// Adds cm/360 to every run and marks if the sens changed since the run before.
function runsWithSens(runs) {
  let previous = null;
  return runs.map((run) => {
    const cm360 = cmPer360(run.sens, run.sensScale, run.dpi);
    const sensChanged = previous !== null && SENS_KEYS.some((key) => run[key] !== previous[key]);
    previous = run;
    // Fingertip scores are invalid in Viscose's benchmarks if played too slow.
    const maxCm = fingertipMax.get(normalizeName(run.scenario));
    const fingertipTooSlow = Boolean(maxCm && cm360 !== null && cm360 > maxCm);
    return { ...run, cm360, sensChanged, fingertipTooSlow };
  });
}

// The plan's session template (docs/training-program.md, "Daglig session-skabelon"),
// with the playlist time filled in from the real playlists.
function sessionSteps(playlistMinutes) {
  if (!playlistMinutes) return [];
  return [
    { name: 'Opvarmning', minutes: 5, text: 'Stræk hænder, håndled, underarme, nakke og skuldre.' },
    { name: 'Below-level', minutes: 5, text: '1 til 2 lette scenarier. Fokus: lavt greb.' },
    { name: 'Skriv cue', minutes: 1, text: 'Én fokus-cue for første scenarie.' },
    { name: 'Hovedblok', minutes: playlistMinutes, text: 'Playlisten i rækkefølge. 1 til 2 min pause hver 15 til 20 min.' },
    { name: 'PB-forsøg', minutes: 5, text: 'Kun hvis du er frisk: ét scenarie tæt på næste rank.' },
    { name: 'Log', minutes: 2, text: 'Udfyld formularen herunder.' },
  ];
}

function withSteps(session) {
  const steps = sessionSteps(session.progress ? session.progress.estimatedMinutes : 0);
  return { ...session, steps, totalMinutes: steps.reduce((sum, step) => sum + step.minutes, 0) };
}

// Which benchmark playlist a scenario belongs to. Opening that playlist once
// makes KovaaK's fetch every scenario in it.
function playlistForScenario(name) {
  if (/ Novice S5$/.test(name)) return { name: 'Voltaic S5.5 Novice', code: thresholds.share_codes.Novice };
  if (/ Intermediate S5$/.test(name)) return { name: 'Voltaic S5.5 Intermediate', code: thresholds.share_codes.Intermediate };
  const benchmark = viscose.benchmarks.find((b) => b.scenarios.some((s) => normalizeName(s.name) === normalizeName(name)));
  return benchmark ? { name: benchmark.name, code: benchmark.share_code } : null;
}

// Marks scenarios you have never played. The first time KovaaK's sees a
// scenario it has to fetch it, and opening the playlist it belongs to gets
// them all at once, which is more reliable than one deep link at a time.
function markNewScenarios(session, runs) {
  if (!session.progress) return session;
  const everPlayed = new Set(runs.map((run) => normalizeName(run.scenario)));
  const newPlaylists = new Map();

  for (const part of session.progress.parts) {
    if (!part.progress) continue;
    for (const item of part.progress.items) {
      item.isNew = !everPlayed.has(normalizeName(item.name));
      if (!item.isNew) continue;
      const playlist = playlistForScenario(item.name);
      if (playlist) newPlaylists.set(playlist.code, playlist);
    }
  }
  return { ...session, newScenarioPlaylists: [...newPlaylists.values()] };
}

// Calendar mode: today's weekday in the plan, counting today's runs.
function calendarSession(today, runs, playlists) {
  const pseudoPass = { deload: false, parts: today.codes.map((c) => ({ kind: 'playlist', code: c.code, title: c.name })) };
  const runsToday = runs.filter((run) => run.playedAt.startsWith(today.date));
  const progress = today.codes.length ? program.passProgress(pseudoPass, runsToday, playlists, 1) : null;
  return markNewScenarios(withSteps({
    mode: 'calendar',
    status: today.codes.length ? 'active' : 'none',
    title: today.schedule,
    position: today.weekInfo,
    progress,
  }), runs);
}

// Follow mode: the pass the pointer is on. Moves the pointer on (and saves it)
// when the current pass is finished.
function followSession(database, today, runs, playlists, logs) {
  const passes = currentPasses(database);
  let state = db.getState(database, 'follow') || follow.startState(0, today);
  const result = follow.advance(state, passes, runs, playlists, programData.deload_volume, today);
  if (result.changed || !db.getState(database, 'follow')) db.setState(database, 'follow', result.state);
  state = result.state;

  const view = follow.followView(state, passes, runs, playlists, programData.deload_volume, today);
  const pass = view.pass;
  // Safety: pain 5+ twice in a row, and the last log is from today -> rest today.
  const lastLogDay = logs[0] ? plan.isoDay(new Date(logs[0].created_at)) : null;
  const painLock = view.status === 'active' && stats.needsRestWarning(logs) && lastLogDay === today;

  return markNewScenarios(withSteps({
    mode: 'follow',
    status: painLock ? 'pain' : view.status,
    title: pass ? `${program.passTitle(pass)}: ${pass.label}` : 'Programmet er gennemført',
    passText: pass ? pass.text : null,
    position: pass ? { week: pass.week, block: pass.block, deload: pass.deload } : null,
    progress: painLock ? null : view.progress || null,
    opensOn: view.opensOn || null,
    finishedToday: Boolean(view.finishedToday),
    daysWaiting: view.daysWaiting || 0,
    index: view.index,
    total: view.total,
    done: view.done,
  }), runs);
}

// What the home screen shows about programmes: either "play these benchmarks
// first", a suggestion you can say yes or no to, or nothing while you are
// already following one. The suggestion itself is built in code, so it works
// with or without Ollama (see src/core/coach-plan.js).
function buildProposal(database, summaries, todayIso) {
  const active = activeProgram(database);
  if (active) {
    const state = db.getState(database, 'follow');
    const finished = state && state.index >= active.passes.length;
    if (!finished) return { status: 'active', name: active.name, kind: active.kind };
  }

  const readiness = coachPlan.benchmarkReadiness(summaries, todayIso);
  if (!readiness.ready) {
    return {
      status: 'needs-benchmarks',
      missing: readiness.missing,
      done: readiness.total - readiness.missing.length,
      total: readiness.total,
      playlistCode: thresholds.share_codes.Intermediate,
    };
  }

  const dismissed = db.getState(database, 'proposalDismissed');
  const kind = (dismissed && dismissed.nextKind) || 'weakness';
  const suggestion = coachPlan.generateProgram(kind, summaries, thresholds.share_codes.Intermediate);
  if (!suggestion) return { status: 'none' };
  if (dismissed && dismissed.until > todayIso && dismissed.kind === suggestion.kind) {
    return { status: 'dismissed', until: dismissed.until };
  }

  const rationale = db.getState(database, 'proposalRationale');
  return {
    status: 'ready',
    program: suggestion,
    stale: readiness.stale,
    rationale: rationale && rationale.id === suggestion.id ? rationale.text : null,
  };
}

function buildData(database, extra, options = {}) {
  const runs = runsWithSens(db.allRuns(database));
  const summaries = stats.scenarioSummaries(runs, thresholds, targets);
  const logs = db.sessionLogs(database);
  const today = plan.todaysTraining(new Date(), config, shareCodes);
  const playlists = db.allPlaylists(database);

  return {
    today,
    followPlan: Boolean(options.followPlan),
    session: options.followPlan
      ? followSession(database, today.date, runs, playlists, logs)
      : calendarSession(today, runs, playlists),
    // For the "Start fra" list on the settings page.
    passes: currentPasses(database).map((pass, index) => ({ index, title: `${program.passTitle(pass)}: ${pass.label}` })),
    activeProgram: activeProgram(database),
    latestRun: runs[runs.length - 1] || null,
    scenarios: summaries,
    radar: stats.radarData(summaries),
    proposal: buildProposal(database, summaries, today.date),
    voltaicShareCodes: thresholds.share_codes,
    viscose: viscose.benchmarks.map((benchmark) => {
      return { id: benchmark.id, name: benchmark.name, ranks: benchmark.ranks, referenceRank: benchmark.reference_rank, shareCode: benchmark.share_code, scenarios: stats.benchmarkSummaries(runs, benchmark) };
    }),
    sessions: stats.groupSessions(runs, config.session_gap_minutes),
    runs: [...runs].reverse(), // newest first for the log
    problems: db.allProblems(database),
    unmatched: stats.unmatchedScenarios(runs, [thresholds, ...viscose.benchmarks]),
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

// Used by main.js for the follow-plan buttons.
function setFollowStart(database, index) {
  db.setState(database, 'follow', follow.startState(index, plan.isoDay(new Date())));
}
function markFollowDone(database) {
  const state = db.getState(database, 'follow');
  if (state) db.setState(database, 'follow', follow.markDone(state, currentPasses(database), plan.isoDay(new Date())));
}

// Saying yes to a suggestion: it becomes the programme you follow, starting
// at its first pass today.
function acceptProposal(database, program) {
  db.setState(database, 'program', program);
  db.setState(database, 'follow', follow.startState(0, plan.isoDay(new Date())));
  db.setState(database, 'proposalDismissed', null);
}

// Saying no: don't suggest the same kind again for a week, and offer the
// other kind next time instead.
function rejectProposal(database, kind) {
  const until = follow.addDays(plan.isoDay(new Date()), 7);
  db.setState(database, 'proposalDismissed', { kind, until, nextKind: kind === 'weakness' ? 'general' : 'weakness' });
}

// "Foreslå alligevel": forget that you said no.
function undismissProposal(database) {
  db.setState(database, 'proposalDismissed', null);
}

// Back to the built-in 12-week plan.
function clearProgram(database) {
  db.setState(database, 'program', null);
  db.setState(database, 'follow', follow.startState(0, plan.isoDay(new Date())));
}

module.exports = {
  buildData, config, planCodesTodayFirst, setFollowStart, markFollowDone,
  acceptProposal, rejectProposal, undismissProposal, clearProgram,
};
