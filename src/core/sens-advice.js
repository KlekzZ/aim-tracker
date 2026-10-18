// Suggests a sens (cm/360) for a scenario, based on which sens has given you
// your best results before.
//
// How it decides, in order:
//  1. Your own runs of this exact scenario, if you have tried at least two
//     different sens on it with 2+ runs each.
//  2. Otherwise runs of similar scenarios (same subcategory, e.g. all
//     "Control" tracking scenarios). Scores are compared as a fraction of
//     each scenario's reference rank, so a 2500 in one and 900 in another
//     can be compared fairly.
//  3. Otherwise the sens you play the most.
// A different sens is only suggested if it was clearly better (at least 3 %)
// than the one you use most. The research says changing sens all the time
// hurts consistency, so the bar for "change it" is deliberately high.
// Viscose's Fingertip rule (50 cm/360 or faster) always wins.

const MIN_RUNS_PER_SENS = 2;
const MIN_GAIN = 0.03;
const FINGERTIP_DEFAULT_CM = 40; // the plan's Fingertip sens (1.30 at 800 DPI)

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Groups runs by sens (cm/360 rounded to the nearest 0.5) and gives each group
// its median normalized score.
function bySens(runs, scoreOf) {
  const groups = new Map();
  for (const run of runs) {
    if (run.cm360 === null || run.cm360 === undefined) continue;
    const value = scoreOf(run);
    if (value === null) continue;
    const key = Math.round(run.cm360 * 2) / 2;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return [...groups].map(([cm, values]) => ({ cm, runs: values.length, median: median(values) }));
}

// The sens you play the most (by number of runs).
function usualCm(runs) {
  const counts = new Map();
  for (const run of runs) {
    if (run.cm360 === null || run.cm360 === undefined) continue;
    const key = Math.round(run.cm360 * 2) / 2;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

function pickFrom(groups, usual, maxCm) {
  const usable = groups.filter((g) => g.runs >= MIN_RUNS_PER_SENS && (!maxCm || g.cm <= maxCm));
  if (usable.length < 2) return null;
  const best = [...usable].sort((a, b) => b.median - a.median)[0];
  const usualGroup = usable.find((g) => g.cm === usual);
  if (!usualGroup) return { group: best, gain: null };
  const gain = (best.median - usualGroup.median) / usualGroup.median;
  return gain >= MIN_GAIN ? { group: best, gain } : { group: usualGroup, gain: 0 };
}

// scenario: { name, subcategory, maxCm360 } . runs: all challenge runs with
// cm360. info: Map normalized name -> { subcategory, reference } where
// reference is the score of the scenario's reference rank.
function recommendSens(scenario, runs, info, normalize) {
  const challenge = runs.filter((r) => (r.mode || '').toLowerCase() === 'challenge' && r.cm360 !== null && r.cm360 !== undefined);
  const usual = usualCm(challenge);
  const maxCm = scenario.maxCm360 || null;
  const key = normalize(scenario.name);

  // 1. This exact scenario.
  const own = challenge.filter((r) => normalize(r.scenario) === key);
  const ownPick = pickFrom(bySens(own, (r) => r.score), usual, maxCm);
  if (ownPick) {
    return { cm: ownPick.group.cm, basis: 'scenario', runs: ownPick.group.runs, gain: ownPick.gain, usual };
  }

  // 2. Similar scenarios: same subcategory, scores as a fraction of their reference rank.
  const subcategory = scenario.subcategory || (info.get(key) || {}).subcategory;
  if (subcategory) {
    const similar = challenge.filter((r) => {
      const meta = info.get(normalize(r.scenario));
      return meta && meta.subcategory === subcategory;
    });
    const similarPick = pickFrom(bySens(similar, (r) => {
      const meta = info.get(normalize(r.scenario));
      return meta && meta.reference ? r.score / meta.reference : null;
    }), usual, maxCm);
    if (similarPick) {
      return { cm: similarPick.group.cm, basis: 'similar', runs: similarPick.group.runs, gain: similarPick.gain, usual, subcategory };
    }
  }

  // 3. Your usual sens, unless a rule says otherwise.
  if (maxCm && (usual === null || usual > maxCm)) {
    return { cm: FINGERTIP_DEFAULT_CM, basis: 'rule', runs: 0, gain: null, usual, maxCm };
  }
  return usual === null ? null : { cm: usual, basis: 'usual', runs: 0, gain: null, usual };
}

module.exports = { recommendSens, MIN_GAIN };
