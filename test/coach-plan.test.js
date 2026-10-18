// Tests for the coach's readiness check and generated programmes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { benchmarkReadiness, weaknessProfile, generateProgram, WEEKS, TRAINING_DAYS } = require('../src/core/coach-plan');
const stats = require('../src/core/stats');
const { passProgress } = require('../src/core/program');

const thresholds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'voltaic_s5_5_thresholds.json'), 'utf8'));

// Builds summaries where every Intermediate scenario has a run, scored at
// `percentOf` of its Platinum threshold unless overridden per subcategory.
function summariesWith(percentBySubcategory, defaultPercent = 0.9, playedAt = '2026-10-17T18:00:00') {
  const runs = [];
  for (const scenario of thresholds.scenarios) {
    if (scenario.tier !== 'Intermediate' || scenario.retired) continue;
    // null means "not played", so check for the key instead of using ??.
    const percent = scenario.subcategory in percentBySubcategory
      ? percentBySubcategory[scenario.subcategory] : defaultPercent;
    if (percent === null) continue; // "not played"
    runs.push({ scenario: scenario.name, mode: 'Challenge', score: scenario.thresholds[0] * percent, playedAt });
  }
  return stats.scenarioSummaries(runs, thresholds, []);
}

test('readiness: all nine subcategories played means ready', () => {
  const readiness = benchmarkReadiness(summariesWith({}), '2026-10-18');
  assert.equal(readiness.ready, true);
  assert.equal(readiness.missing.length, 0);
  assert.equal(readiness.total, 9);
});

test('readiness: missing subcategories are named with a scenario to play', () => {
  const readiness = benchmarkReadiness(summariesWith({ Control: null, Evasive: null }), '2026-10-18');
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing.map((m) => m.subcategory).sort(), ['Control', 'Evasive']);
  // The suggested scenario must be a real Intermediate scenario.
  for (const miss of readiness.missing) {
    assert.ok(thresholds.scenarios.some((s) => s.name === miss.scenario && s.tier === 'Intermediate'));
  }
});

test('readiness: results older than four weeks are flagged as stale', () => {
  const old = summariesWith({}, 0.9, '2026-08-01T18:00:00');
  const readiness = benchmarkReadiness(old, '2026-10-18');
  assert.equal(readiness.ready, true); // you have scores, they are just old
  assert.equal(readiness.stale.length, 9);
  assert.ok(readiness.stale[0].days > 28);
});

test('profile: weakest subcategory first, with best and worst scenario', () => {
  const profile = weaknessProfile(summariesWith({ Control: 0.6, Reactive: 0.7 }));
  assert.equal(profile[0].subcategory, 'Control');
  assert.equal(profile[1].subcategory, 'Reactive');
  assert.ok(profile[0].percent < profile[1].percent);
  assert.notEqual(profile[0].bestScenario, profile[0].worstScenario);
});

test('program: focuses on the two weakest subcategories', () => {
  const program = generateProgram('weakness', summariesWith({ Control: 0.6, Reactive: 0.7 }), 'KovaaKsCarryingNarrowCt');
  assert.deepEqual(program.focus, ['Control', 'Reactive']);
  assert.match(program.name, /Control og Reactive/);
  assert.equal(program.passes.length, WEEKS * TRAINING_DAYS.length);
});

test('program: every scenario it names really exists', () => {
  const known = new Set(thresholds.scenarios.map((s) => s.name));
  for (const kind of ['weakness', 'general']) {
    const program = generateProgram(kind, summariesWith({ Control: 0.6, Reactive: 0.7 }), 'KovaaKsCarryingNarrowCt');
    for (const pass of program.passes) {
      for (const part of pass.parts) {
        for (const scenario of part.scenarios || []) {
          assert.ok(known.has(scenario.name), `${kind}: unknown scenario ${scenario.name}`);
          assert.ok(scenario.playCount >= 1);
        }
      }
    }
  }
});

test('program: a rest day after the last training day of each week, and a test at the end', () => {
  const program = generateProgram('weakness', summariesWith({}), 'KovaaKsCarryingNarrowCt');
  const restDays = program.passes.filter((p) => p.restAfter);
  assert.equal(restDays.length, WEEKS);
  const last = program.passes[program.passes.length - 1];
  assert.equal(last.isTest, true);
  assert.equal(last.parts[0].code, 'KovaaKsCarryingNarrowCt');
});

test('program: passes work with the "Følg planen" progress code', () => {
  const program = generateProgram('weakness', summariesWith({ Control: 0.6 }), 'KovaaKsCarryingNarrowCt');
  const first = program.passes[0];
  const scenarioNames = first.parts[0].scenarios.map((s) => s.name);
  const runs = first.parts[0].scenarios.flatMap((s) =>
    Array.from({ length: s.playCount }, () => ({ scenario: s.name, mode: 'Challenge', playedAt: '2026-10-20T18:00:00' })));

  const none = passProgress(first, [], {}, 0.5);
  assert.equal(none.complete, false);
  assert.equal(none.parts[0].progress.nextName, scenarioNames[0]);

  const done = passProgress(first, runs, {}, 0.5);
  assert.equal(done.complete, true);
  assert.ok(done.estimatedMinutes > 0);
});

test('program: general kind covers all three categories', () => {
  const program = generateProgram('general', summariesWith({}), 'KovaaKsCarryingNarrowCt');
  assert.deepEqual(program.focus, ['Clicking', 'Tracking', 'Switching']);
  const firstWeek = program.passes.filter((p) => p.week === 1).map((p) => p.label).join(' ');
  for (const category of ['Clicking', 'Tracking', 'Switching']) assert.match(firstWeek, new RegExp(category));
});

test('program: returns null when there is too little to plan from', () => {
  const almostEmpty = summariesWith({ Control: 0.6, Reactive: null, Evasive: null, Speed: null, Static: null, Linear: null, Dynamic: null, Precise: null, Stability: null });
  assert.equal(generateProgram('weakness', almostEmpty, 'code'), null);
});
