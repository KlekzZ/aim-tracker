// Tests for the Viscose benchmarks (data file and calculations).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const stats = require('../src/core/stats');
const { cmPer360 } = require('../src/core/sens');

const viscose = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'viscose_thresholds.json'), 'utf8'));
const byId = (id) => viscose.benchmarks.find((b) => b.id === id);
const run = (scenario, score, cm360 = 52, mode = 'Challenge') => ({ scenario, score, cm360, mode, playedAt: '2026-10-20T18:00:00' });

test('data: Easier and Medium have 36 scenarios and 8 ranks, Hard has 6 ranks', () => {
  assert.equal(byId('easier').scenarios.length, 36);
  assert.equal(byId('easier').ranks.length, 8);
  assert.equal(byId('medium').ranks.length, 8);
  assert.equal(byId('hard').ranks.length, 6);
  for (const b of viscose.benchmarks) {
    assert.ok(b.ranks.includes(b.reference_rank), `${b.name}: reference rank must exist`);
    for (const s of b.scenarios) {
      assert.equal(s.thresholds.length, b.ranks.length, `${b.name}: ${s.name}`);
      assert.ok(s.thresholds.every((t, i) => i === 0 || t > s.thresholds[i - 1]), `${b.name}: ${s.name} must rise`);
    }
  }
});

test('ranks: a score gets the highest rank it reaches and the next one as goal', () => {
  const summaries = stats.benchmarkSummaries([run('SmoothBot Invincible Goated 75%', 3000)], byId('easier'));
  const smoothbot = summaries.find((s) => s.name.startsWith('Smoothbot Invincible'));
  assert.equal(smoothbot.rank, 'Penguin'); // 2900 <= 3000 < 3150
  assert.equal(smoothbot.nextRank, 'Fox');
  assert.equal(smoothbot.nextThreshold, 3150);
});

test('names match ignoring case and extra spaces', () => {
  const summaries = stats.benchmarkSummaries([run('  whisphere   80%', 11000)], byId('easier'));
  assert.equal(summaries.find((s) => s.name === 'Whisphere 80%').best, 11000);
});

test('Fingertip runs slower than 50 cm/360 do not count', () => {
  const name = 'Cloverrawcontrol Easy 80% Speed';
  const summary = (runs) => stats.benchmarkSummaries(runs, byId('easier')).find((s) => s.name === name);
  const slow = summary([run(name, 9999, 61.1)]);
  assert.equal(slow.best, null);
  assert.equal(slow.invalidRunCount, 1);
  const mixed = summary([run(name, 9999, 61.1), run(name, 6300, 40)]);
  assert.equal(mixed.best, 6300);
  assert.equal(mixed.invalidRunCount, 1);
  // Unknown sens: we trust the run instead of throwing it away.
  assert.equal(summary([run(name, 6300, null)]).best, 6300);
});

test('Fingertip limit uses the real cm/360 maths (sens 1.30 at 800 DPI is about 40 cm)', () => {
  const cm = cmPer360(1.3, 'CSGO', 800);
  assert.ok(cm <= 50);
  assert.ok(cmPer360(0.85, 'CSGO', 800) > 50);
});

test('non-Challenge runs and unmatched names', () => {
  const runs = [run('Whisphere 80%', 12000, 52, 'Freeplay'), run('Some Other Scenario', 5)];
  assert.equal(stats.benchmarkSummaries(runs, byId('easier')).find((s) => s.name === 'Whisphere 80%').best, null);
  const unmatched = stats.unmatchedScenarios(runs, [{ scenarios: [] }, ...viscose.benchmarks]);
  assert.deepEqual(unmatched.map((u) => u.name), ['Some Other Scenario']);
});
