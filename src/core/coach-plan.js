// The coach's program suggestions.
//
// The program itself is built here in code, not by the AI. That way every
// scenario name is real and playable, the volume and rest rules always hold,
// and the suggestion works even without Ollama installed. The AI only writes
// the "why" on top of it (see src/main/coach.js).
//
// Voltaic ranks a subcategory by your best score in it, and the overall rank
// is a harmonic mean, so the weakest subcategories hold you back the most.
// That is why the weakness program picks the two lowest.

const TRAINING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // Sunday is rest
const DAY_NAMES_DA = { Mon: 'Mandag', Tue: 'Tirsdag', Wed: 'Onsdag', Thu: 'Torsdag', Fri: 'Fredag', Sat: 'Lørdag' };
const WEEKS = 3;
const FOCUS_RUNS = 3;      // enough repeats to adapt to a scenario
const MAINTAIN_RUNS = 2;   // keep your strengths without taking over the session
const WARMUP_RUNS = 1;
const STALE_DAYS = 28;     // after this, a benchmark result is old news

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------- What does the coach know about you? ----------

function groupBySubcategory(summaries) {
  const groups = new Map();
  for (const s of summaries) {
    if (!groups.has(s.subcategory)) groups.set(s.subcategory, []);
    groups.get(s.subcategory).push(s);
  }
  return groups;
}

// Which Voltaic Intermediate subcategories have no result yet (or an old one).
// Without one score in every subcategory there is no overall rank to work from.
function benchmarkReadiness(summaries, todayIso) {
  const intermediate = summaries.filter((s) => s.tier === 'Intermediate' && !s.retired);
  const today = new Date(`${todayIso}T12:00:00`);
  const missing = [];
  const stale = [];

  for (const [subcategory, scenarios] of groupBySubcategory(intermediate)) {
    const played = scenarios.filter((s) => s.runCount > 0);
    if (!played.length) {
      // Suggest the scenario you have a baseline for, else the first one.
      const pick = scenarios.find((s) => s.baselineBest !== null) || scenarios[0];
      missing.push({ subcategory, scenario: pick.name });
      continue;
    }
    const newest = played.map((s) => s.lastPlayedAt).sort().pop();
    const days = Math.floor((today - new Date(newest)) / MS_PER_DAY);
    if (days > STALE_DAYS) stale.push({ subcategory, days });
  }

  return { ready: missing.length === 0, missing, stale, total: groupBySubcategory(intermediate).size };
}

// Your subcategories sorted weakest first, with the scenario that is holding
// each one up (best) and the one lagging behind (worst).
function weaknessProfile(summaries) {
  const intermediate = summaries.filter((s) => s.tier === 'Intermediate' && !s.retired);
  const rows = [];

  for (const [subcategory, scenarios] of groupBySubcategory(intermediate)) {
    const played = scenarios.filter((s) => s.percentOfPlatinum !== null);
    if (!played.length) continue;
    const sorted = [...played].sort((a, b) => b.percentOfPlatinum - a.percentOfPlatinum);
    rows.push({
      subcategory,
      category: scenarios[0].category,
      percent: sorted[0].percentOfPlatinum, // Voltaic counts your best scenario
      bestScenario: sorted[0].name,
      worstScenario: sorted[sorted.length - 1].name,
      unplayed: scenarios.filter((s) => s.runCount === 0).map((s) => s.name),
    });
  }
  return rows.sort((a, b) => a.percent - b.percent);
}

// ---------- Building a program ----------

// The Novice version of a scenario, used as an easy warm-up ("below level").
function novicePartner(scenarioName, summaries) {
  const base = scenarioName.replace(/ Intermediate S5$/, '');
  const novice = summaries.find((s) => s.tier === 'Novice' && !s.retired && s.name === `${base} Novice S5`);
  return novice ? novice.name : null;
}

const scenarioPart = (title, text, scenarios) => ({ kind: 'scenarios', title, text, scenarios });

// One training day: a short warm-up, the day's focus, and a bit of upkeep.
function buildDay(week, dayKey, plan, summaries) {
  const focusNames = plan.focus;
  const warmup = focusNames.map((name) => novicePartner(name, summaries)).find(Boolean);
  const scenarios = [];
  if (warmup) scenarios.push({ name: warmup, playCount: WARMUP_RUNS });
  for (const name of focusNames) scenarios.push({ name, playCount: FOCUS_RUNS });
  for (const name of plan.maintain) scenarios.push({ name, playCount: MAINTAIN_RUNS });

  return {
    id: `gen-w${week}-${dayKey}`,
    week,
    block: 1,
    deload: false,
    day: dayKey,
    label: plan.label,
    text: plan.text || null,
    isTest: false,
    restAfter: dayKey === TRAINING_DAYS[TRAINING_DAYS.length - 1],
    parts: [scenarioPart(plan.label, 'Start med opvarmningen øverst, og tag dem i rækkefølge.', scenarios)],
  };
}

// The last day of the programme: play the benchmark again and see the change.
function buildTestDay(week, shareCode) {
  return {
    id: `gen-w${week}-test`,
    week,
    block: 1,
    deload: false,
    day: TRAINING_DAYS[TRAINING_DAYS.length - 1],
    label: 'Test: Voltaic S5.5 Intermediate',
    text: 'Spil benchmarket igennem, når du er frisk. Nu kan du se, hvad de tre uger gav.',
    isTest: true,
    restAfter: true,
    parts: [{ kind: 'playlist', code: shareCode, title: 'Voltaic S5.5 Intermediate' }],
  };
}

// A week of days for the "fix your weaknesses" programme: the two weakest
// subcategories get most of the days, the strongest get kept warm.
function weaknessWeek(profile) {
  const [first, second] = profile;
  const third = profile[2];
  const strong = [...profile].reverse().slice(0, 2);
  const focusOf = (row) => [row.bestScenario, row.worstScenario].filter((v, i, a) => a.indexOf(v) === i);

  return [
    { label: `${first.subcategory}: begge scenarier`, focus: focusOf(first), maintain: [strong[0].bestScenario] },
    { label: `${second.subcategory}: begge scenarier`, focus: focusOf(second), maintain: [strong[1].bestScenario] },
    { label: `${first.subcategory}: push det bedste`, focus: [first.bestScenario], maintain: [second.worstScenario] },
    { label: `${second.subcategory}: push det bedste`, focus: [second.bestScenario], maintain: [first.worstScenario] },
    { label: `Blandet: ${first.subcategory} og ${second.subcategory}`, focus: [first.worstScenario, second.worstScenario], maintain: [] },
    third
      ? { label: `${third.subcategory} og vedligehold`, focus: [third.bestScenario], maintain: strong.map((s) => s.bestScenario) }
      : { label: 'Vedligehold', focus: strong.map((s) => s.bestScenario), maintain: [] },
  ];
}

// A week for the "general" programme: one category per day, so clicking,
// tracking and switching all get trained twice a week.
function generalWeek(profile) {
  const weakest = profile[0];
  const byCategory = (category) => profile.filter((row) => row.category === category);
  const pickTwo = (rows) => rows.slice(0, 2).map((row) => row.bestScenario);
  const days = [];
  for (const category of ['Clicking', 'Tracking', 'Switching']) {
    const rows = byCategory(category);
    if (!rows.length) continue;
    days.push({ label: `${category}: svageste to`, focus: pickTwo(rows), maintain: [] });
    days.push({ label: `${category}: variation`, focus: [rows[0].worstScenario], maintain: [weakest.bestScenario] });
  }
  return days.slice(0, TRAINING_DAYS.length);
}

// kind: 'weakness' (default) or 'general'.
function generateProgram(kind, summaries, shareCode) {
  const profile = weaknessProfile(summaries);
  if (profile.length < 3) return null; // not enough to plan from

  const week = kind === 'general' ? generalWeek(profile) : weaknessWeek(profile);
  const passes = [];
  for (let w = 1; w <= WEEKS; w++) {
    TRAINING_DAYS.forEach((dayKey, i) => {
      const isLastDayOfProgram = w === WEEKS && i === TRAINING_DAYS.length - 1;
      if (isLastDayOfProgram && shareCode) passes.push(buildTestDay(w, shareCode));
      else passes.push(buildDay(w, dayKey, week[i % week.length], summaries));
    });
  }

  const focus = kind === 'general'
    ? ['Clicking', 'Tracking', 'Switching']
    : [profile[0].subcategory, profile[1].subcategory];
  const runsPerWeek = passes.filter((p) => p.week === 1)
    .reduce((sum, p) => sum + p.parts.reduce((n, part) => n + (part.scenarios || []).reduce((m, s) => m + s.playCount, 0), 0), 0);

  return {
    id: `${kind}-${focus.join('-')}-${new Date().toISOString().slice(0, 10)}`,
    kind,
    name: kind === 'general' ? 'Generel forbedring (3 uger)' : `Fokus: ${focus.join(' og ')} (3 uger)`,
    createdAt: new Date().toISOString(),
    weeks: WEEKS,
    daysPerWeek: TRAINING_DAYS.length,
    focus,
    // Shown on the card so you know what you are saying yes to.
    summary: kind === 'general'
      ? `${WEEKS} uger, ${TRAINING_DAYS.length} dage om ugen. Alle tre kategorier hver uge, med ekstra vægt på dine svageste scenarier.`
      : `${WEEKS} uger, ${TRAINING_DAYS.length} dage om ugen med fokus på ${focus.join(' og ')}, dine to svageste underkategorier. Dine stærke sider bliver holdt ved lige.`,
    profile: profile.slice(0, 3).map((row) => ({ subcategory: row.subcategory, percent: row.percent })),
    runsPerWeek,
    passes,
    dayNames: DAY_NAMES_DA,
  };
}

module.exports = {
  benchmarkReadiness, weaknessProfile, generateProgram,
  TRAINING_DAYS, WEEKS, STALE_DAYS, DAY_NAMES_DA,
};
