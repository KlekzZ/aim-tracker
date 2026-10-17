// Pure calculations on runs: matching, best/median, ranks, radar and sessions.
// "Pure" means: data in, data out, no files or database. Easy to test.

// Voltaic's 9 subcategories in the order the radar draws them.
const SUBCATEGORIES = [
  'Dynamic', 'Static', 'Linear', // Clicking
  'Precise', 'Reactive', 'Control', // Tracking
  'Speed', 'Evasive', 'Stability', // Switching
];

// Only Challenge runs count for scores. Freeplay and other modes are stored
// and shown in the log, but they are not benchmark attempts.
const isChallenge = (run) => (run.mode || '').toLowerCase() === 'challenge';

function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Exact match, ignoring upper/lower case and extra spaces. No fuzzy guessing:
// names that don't match go to the "unmatched" list instead.
const normalize = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

function groupRunsByScenario(runs) {
  const groups = new Map();
  for (const run of runs.filter(isChallenge)) {
    const key = normalize(run.scenario);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  return groups; // runs inside each group keep their time order
}

// Where a score sits on the rank ladder of one scenario.
function rankInfo(score, scenario, rankNames) {
  if (score === null) return { rank: null, nextRank: rankNames[0], nextThreshold: scenario.thresholds[0], progress: null };
  let reached = -1;
  scenario.thresholds.forEach((threshold, i) => { if (score >= threshold) reached = i; });
  const next = reached + 1;
  const done = next >= scenario.thresholds.length;
  return {
    rank: reached >= 0 ? rankNames[reached] : null,
    nextRank: done ? null : rankNames[next],
    nextThreshold: done ? null : scenario.thresholds[next],
    progress: done ? 1 : score / scenario.thresholds[next],
  };
}

function scenarioSummaries(runs, thresholds, targets) {
  const groups = groupRunsByScenario(runs);
  const targetByName = new Map(targets.map((t) => [normalize(t.scenario), t]));

  return thresholds.scenarios.map((scenario) => {
    const scenarioRuns = groups.get(normalize(scenario.name)) || [];
    const scores = scenarioRuns.map((run) => run.score);
    const best = scores.length ? Math.max(...scores) : null;
    const rankNames = scenario.tier === 'Novice' ? thresholds.novice_ranks : thresholds.intermediate_ranks;
    const target = targetByName.get(normalize(scenario.name)) || null;

    return {
      name: scenario.name,
      tier: scenario.tier,
      category: scenario.category,
      subcategory: scenario.subcategory,
      thresholds: scenario.thresholds,
      rankNames,
      baselineBest: scenario.baseline_best ?? null,
      runCount: scenarioRuns.length,
      best,
      medianLast3: median(scores.slice(-3)),
      // For Intermediate the first threshold is Platinum.
      percentOfPlatinum: scenario.tier === 'Intermediate' && best !== null ? best / scenario.thresholds[0] : null,
      ...rankInfo(best, scenario, rankNames),
      target,
    };
  });
}

// Scenario names in the runs that are not in the thresholds file.
function unmatchedScenarios(runs, thresholds) {
  const known = new Set(thresholds.scenarios.map((s) => normalize(s.name)));
  const counts = new Map();
  for (const run of runs) {
    if (known.has(normalize(run.scenario))) continue;
    counts.set(run.scenario, (counts.get(run.scenario) || 0) + 1);
  }
  return [...counts].map(([name, runCount]) => ({ name, runCount })).sort((a, b) => a.name.localeCompare(b.name));
}

// Voltaic counts the best scenario per subcategory, so the radar does too.
// Values are fractions of Platinum (1 = Platinum). null = no runs yet.
function radarData(summaries) {
  const intermediate = summaries.filter((s) => s.tier === 'Intermediate');
  return SUBCATEGORIES.map((subcategory) => {
    const pair = intermediate.filter((s) => s.subcategory === subcategory);
    const pick = (valueOf) => {
      const values = pair.map(valueOf).filter((v) => v !== null);
      return values.length ? Math.max(...values) : null;
    };
    return {
      subcategory,
      current: pick((s) => s.percentOfPlatinum),
      baseline: pick((s) => (s.baselineBest === null ? null : s.baselineBest / s.thresholds[0])),
    };
  });
}

// A new session starts when there are more than gapMinutes between two runs.
function groupSessions(runs, gapMinutes) {
  const sessions = [];
  const sorted = [...runs].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  for (const run of sorted) {
    const time = new Date(run.playedAt).getTime();
    const current = sessions[sessions.length - 1];
    if (current && time - current.endTime <= gapMinutes * 60 * 1000) {
      current.runs.push(run);
      current.endTime = time;
    } else {
      sessions.push({ runs: [run], startTime: time, endTime: time });
    }
  }

  return sessions.reverse().map((session) => {
    const perScenario = new Map();
    for (const run of session.runs) {
      const entry = perScenario.get(run.scenario) || { scenario: run.scenario, runs: 0, best: null };
      entry.runs++;
      entry.best = entry.best === null ? run.score : Math.max(entry.best, run.score);
      perScenario.set(run.scenario, entry);
    }
    return {
      start: session.runs[0].playedAt,
      end: session.runs[session.runs.length - 1].playedAt,
      // The file time is when a run ended, so this is first end to last end.
      minutes: Math.round((session.endTime - session.startTime) / 60000),
      runCount: session.runs.length,
      scenarios: [...perScenario.values()],
    };
  });
}

// True if the two newest session logs both have pain 5 or higher.
function needsRestWarning(logsNewestFirst) {
  return logsNewestFirst.length >= 2 && logsNewestFirst[0].pain >= 5 && logsNewestFirst[1].pain >= 5;
}

module.exports = {
  SUBCATEGORIES,
  isChallenge,
  median,
  rankInfo,
  scenarioSummaries,
  unmatchedScenarios,
  radarData,
  groupSessions,
  needsRestWarning,
};
