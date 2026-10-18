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
const TEST_RUNS = 3;       // a median needs at least three runs
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
function buildBenchmarkDay(week, shareCode) {
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

// The weekly test day: the same few scenarios every week, 3 runs each, so the
// median can be compared week to week. A median, not a PB, because a single
// best run is partly luck.
function buildWeeklyTest(week, testScenarios) {
  return {
    id: `gen-w${week}-weekly-test`,
    week,
    block: 1,
    deload: false,
    day: TRAINING_DAYS[TRAINING_DAYS.length - 1],
    label: 'Testdag: dine faste test-scenarier',
    text: 'Samme scenarier hver uge, 3 runs hver. Appen sammenligner medianen med ugen før. Tag en kort opvarmning først.',
    isTest: false,
    testDay: true,
    restAfter: true,
    parts: [scenarioPart('Test-scenarier', 'Spil dem i rækkefølge. Jagt ikke rekorder, bare spil normalt.',
      testScenarios.map((name) => ({ name, playCount: TEST_RUNS })))],
  };
}

// The Viscose day: your two weakest Viscose subcategories, measured against
// the benchmark's reference rank. Needs results in at least two of them,
// otherwise there is nothing to measure "weakest" by.
function viscoseDay(viscose) {
  if (!viscose || !viscose.scenarios) return null;
  const refIndex = Math.max(0, viscose.ranks.indexOf(viscose.referenceRank));
  const bySub = new Map();
  for (const s of viscose.scenarios) {
    if (!bySub.has(s.subcategory)) bySub.set(s.subcategory, []);
    bySub.get(s.subcategory).push({ name: s.name, ratio: s.best !== null ? s.best / s.thresholds[refIndex] : null });
  }
  const ranked = [...bySub]
    .map(([subcategory, scenarios]) => ({
      subcategory,
      scenarios,
      best: Math.max(...scenarios.map((s) => (s.ratio === null ? -1 : s.ratio))),
    }))
    .filter((sub) => sub.best >= 0)
    .sort((a, b) => a.best - b.best)
    .slice(0, 2);
  if (ranked.length < 2) return null;

  // The two weakest scenarios in each, unplayed ones first (they need it most).
  const pick = (sub) => [...sub.scenarios]
    .sort((a, b) => (a.ratio === null ? -1 : a.ratio) - (b.ratio === null ? -1 : b.ratio))
    .slice(0, 2).map((s) => s.name);
  return {
    label: `Viscose: ${ranked[0].subcategory} og ${ranked[1].subcategory}`,
    text: `Dine to svageste underkategorier i ${viscose.name}. Andre scenarier med de samme bevægelser hjælper på overførslen.`,
    focus: [...pick(ranked[0]), ...pick(ranked[1])],
    maintain: [],
    viscose: true,
  };
}

// Four Voltaic days for the "fix your weaknesses" programme: the two weakest
// subcategories get most of the time, the strongest are kept warm.
function weaknessDays(profile) {
  const [first, second] = profile;
  const strong = [...profile].reverse().slice(0, 2);
  const focusOf = (row) => [row.bestScenario, row.worstScenario].filter((v, i, a) => a.indexOf(v) === i);
  return [
    { label: `${first.subcategory}: begge scenarier`, focus: focusOf(first), maintain: [strong[0].bestScenario] },
    { label: `${second.subcategory}: begge scenarier`, focus: focusOf(second), maintain: [strong[1].bestScenario] },
    { label: `${first.subcategory}: push det bedste`, focus: [first.bestScenario], maintain: [second.worstScenario] },
    { label: `${second.subcategory}: push det bedste`, focus: [second.bestScenario], maintain: [first.worstScenario] },
  ];
}

// Four days for the "general" programme: one per category, then a day with
// the weakest scenario of each category.
function generalDays(profile) {
  const days = [];
  for (const category of ['Clicking', 'Tracking', 'Switching']) {
    const rows = profile.filter((row) => row.category === category);
    if (rows.length) days.push({ label: `${category}: svageste to`, focus: rows.slice(0, 2).map((r) => r.bestScenario), maintain: [] });
  }
  days.push({
    label: 'Variation: det svageste scenarie i hver kategori',
    focus: ['Clicking', 'Tracking', 'Switching']
      .map((category) => profile.find((row) => row.category === category))
      .filter(Boolean).map((row) => row.worstScenario),
    maintain: [],
  });
  return days.slice(0, 4);
}

// kind: 'weakness' (default) or 'general'.
// options.viscose: Viscose Easier with its summaries, for the Viscose day.
function generateProgram(kind, summaries, shareCode, options = {}) {
  const profile = weaknessProfile(summaries);
  if (profile.length < 3) return null; // not enough to plan from

  const [first, second] = profile;
  const voltaicDays = kind === 'general' ? generalDays(profile) : weaknessDays(profile);
  // Friday: Viscose if you have played enough of it, else a mixed day.
  const friday = viscoseDay(options.viscose)
    || { label: `Blandet: ${first.subcategory} og ${second.subcategory}`, focus: [first.worstScenario, second.worstScenario], maintain: [] };
  const week = [...voltaicDays, friday];
  // The same test scenarios every week: the scenario Voltaic counts (your
  // best) in each of your three weakest subcategories.
  const testScenarios = profile.slice(0, 3).map((row) => row.bestScenario);

  const passes = [];
  for (let w = 1; w <= WEEKS; w++) {
    TRAINING_DAYS.forEach((dayKey, i) => {
      if (i === TRAINING_DAYS.length - 1) {
        // Saturday: the full benchmark at the end, the short test before that.
        passes.push(w === WEEKS && shareCode ? buildBenchmarkDay(w, shareCode) : buildWeeklyTest(w, testScenarios));
      } else {
        passes.push(buildDay(w, dayKey, week[i % week.length], summaries));
      }
    });
  }

  const focus = kind === 'general' ? ['Clicking', 'Tracking', 'Switching'] : [first.subcategory, second.subcategory];
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
    summary: (kind === 'general'
      ? `${WEEKS} uger, ${TRAINING_DAYS.length} dage om ugen. Alle tre kategorier hver uge, med ekstra vægt på dine svageste scenarier.`
      : `${WEEKS} uger, ${TRAINING_DAYS.length} dage om ugen med fokus på ${focus.join(' og ')}, dine to svageste underkategorier. Dine stærke sider bliver holdt ved lige.`)
      + (friday.viscose ? ' Fredag er en Viscose-dag.' : '')
      + ' Lørdag er testdag, så du kan se fremgangen uge for uge.',
    profile: profile.slice(0, 3).map((row) => ({ subcategory: row.subcategory, percent: row.percent })),
    // Where you stood when the programme was made, so the report can compare.
    startProfile: profile.map((row) => ({ subcategory: row.subcategory, percent: row.percent })),
    testScenarios,
    runsPerWeek,
    passes,
    dayNames: DAY_NAMES_DA,
  };
}

// ---------- How did the programme go? ----------

const medianOf = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Compares now with when you said yes:
//  - each subcategory: best % of Platinum then and now (what Voltaic counts)
//  - each test scenario: median of the last 3 runs before, and per programme week
function programReport(program, summaries, runs, todayIso, normalize) {
  // Programmes accepted before 0.9 have no startedAt/startProfile: use what they have.
  const startedAt = program && (program.startedAt || program.createdAt);
  const startProfile = program && (program.startProfile || program.profile);
  if (!startedAt || !startProfile) return null;
  const now = new Map(weaknessProfile(summaries).map((row) => [row.subcategory, row.percent]));
  const subcategories = startProfile.map((row) => {
    const current = now.has(row.subcategory) ? now.get(row.subcategory) : row.percent;
    return { subcategory: row.subcategory, before: row.percent, now: current, change: current - row.percent, focus: program.focus.includes(row.subcategory) };
  });

  const start = startedAt.slice(0, 10);
  const noon = (iso) => new Date(`${iso}T12:00:00`);
  const weekOf = (iso) => Math.floor((noon(iso) - noon(start)) / (7 * MS_PER_DAY)) + 1;
  const challenge = runs.filter((r) => (r.mode || '').toLowerCase() === 'challenge');

  const tests = (program.testScenarios || []).map((name) => {
    const mine = challenge.filter((r) => normalize(r.scenario) === normalize(name));
    const before = medianOf(mine.filter((r) => r.playedAt.slice(0, 10) < start).slice(-3).map((r) => r.score));
    const weeks = [];
    for (let w = 1; w <= program.weeks; w++) {
      weeks.push(medianOf(mine.filter((r) => {
        const date = r.playedAt.slice(0, 10);
        return date >= start && weekOf(date) === w;
      }).map((r) => r.score)));
    }
    const latest = [...weeks].reverse().find((v) => v !== null);
    return {
      scenario: name,
      before,
      weeks,
      change: before && latest !== undefined ? (latest - before) / before : null,
    };
  });

  return {
    programName: program.name,
    startedAt,
    subcategories,
    tests,
    week: Math.min(program.weeks, Math.max(1, weekOf(todayIso))),
    finished: weekOf(todayIso) > program.weeks,
  };
}

module.exports = {
  benchmarkReadiness, weaknessProfile, generateProgram, programReport,
  TRAINING_DAYS, WEEKS, STALE_DAYS, DAY_NAMES_DA,
};
