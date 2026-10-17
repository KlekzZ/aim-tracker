// Tests for cm/360, playlist progress, S5.5 data, plan weeks, sessions and ranks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cmPer360 } = require('../src/core/sens');
const { playlistProgress } = require('../src/core/playlist-progress');
const plan = require('../src/core/plan');
const stats = require('../src/core/stats');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data', 'config.json'), 'utf8'));
const thresholds = JSON.parse(fs.readFileSync(path.join(root, 'data', 'voltaic_s5_5_thresholds.json'), 'utf8'));
const planText = fs.readFileSync(path.join(root, 'docs', 'training-program.md'), 'utf8');

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.1, `${actual} != ${expected}`);

test('cm/360: CSGO 0.85 at 800 DPI is 61.1 cm (as in the plan)', () => {
  near(cmPer360(0.85, 'CSGO', 800), 61.1);
  near(cmPer360(1.3, 'CSGO', 800), 40);
});

test('cm/360: cm/360 scale is used as-is, unknown scale gives null', () => {
  assert.equal(cmPer360(45, 'cm/360', 800), 45);
  assert.equal(cmPer360(1, 'SomethingNew', 800), null);
});

test('playlist progress: counts today\'s Challenge runs per scenario', () => {
  const playlist = { scenarios: [{ name: 'A', playCount: 2 }, { name: 'B', playCount: 1 }] };
  const run = (scenario, mode = 'Challenge') => ({ scenario, mode });
  const half = playlistProgress(playlist, [run('A'), run('a '), run('B', 'Freeplay')]);
  assert.equal(half.totalDone, 2);
  assert.equal(half.complete, false);
  assert.equal(half.nextName, 'B');
  const done = playlistProgress(playlist, [run('A'), run('A'), run('A'), run('B')]);
  assert.equal(done.complete, true);
  assert.equal(done.items[0].extra, 1);
});

test('S5.5: 21 active scenarios per tier, DriftTS retired and left out of the radar', () => {
  const active = thresholds.scenarios.filter((s) => s.tier === 'Intermediate' && !s.retired);
  assert.equal(active.length, 21);
  const summaries = stats.scenarioSummaries([{ scenario: 'VT DriftTS Intermediate S5', mode: 'Challenge', score: 999 }], thresholds, []);
  const evasive = stats.radarData(summaries).find((r) => r.subcategory === 'Evasive');
  assert.equal(evasive.current, null); // the DriftTS run doesn't count
});

test('plan: week numbers, deload and Clicking I/II', () => {
  assert.equal(plan.planWeek(plan.localDate('2026-10-17'), config).week, 0);
  assert.equal(plan.planWeek(plan.localDate('2026-10-19'), config).week, 1);
  assert.equal(plan.planWeek(plan.localDate('2026-11-09'), config).week, 4);
  assert.equal(plan.planWeek(plan.localDate('2026-11-09'), config).deload, true);

  const codes = plan.readShareCodes(planText);
  assert.equal(codes.adept['Tracking I'], 'KovaaKsCampingGoatedFamas');

  // Tue 2026-10-20 is week 1 (odd) -> Clicking I. Tue 2026-10-27 is week 2 -> Clicking II.
  assert.equal(plan.todaysTraining(plan.localDate('2026-10-20'), config, codes).codes[0].name, 'VDIM Adept Clicking I');
  assert.equal(plan.todaysTraining(plan.localDate('2026-10-27'), config, codes).codes[0].name, 'VDIM Adept Clicking II');
  // Sunday is rest, no code.
  assert.equal(plan.todaysTraining(plan.localDate('2026-10-25'), config, codes).codes.length, 0);
});

test('sessions: a gap over 20 minutes starts a new session', () => {
  const run = (playedAt) => ({ scenario: 'A', mode: 'Challenge', score: 1, playedAt });
  const sessions = stats.groupSessions(
    [run('2026-10-20T18:00:00'), run('2026-10-20T18:15:00'), run('2026-10-20T19:00:00')],
    20
  );
  assert.equal(sessions.length, 2);
  assert.equal(sessions[1].runCount, 2); // oldest session is last
});

test('ranks: next threshold and progress', () => {
  const scenario = { thresholds: [2775, 3200, 3550, 3875] };
  const ranks = ['Platinum', 'Diamond', 'Jade', 'Master'];
  const info = stats.rankInfo(2303, scenario, ranks);
  assert.equal(info.rank, null);
  assert.equal(info.nextRank, 'Platinum');
  near(info.progress, 2303 / 2775);
  assert.equal(stats.rankInfo(3300, scenario, ranks).rank, 'Diamond');
});

test('rest warning: two sessions in a row with pain 5+', () => {
  assert.equal(stats.needsRestWarning([{ pain: 5 }, { pain: 6 }]), true);
  assert.equal(stats.needsRestWarning([{ pain: 5 }, { pain: 2 }]), false);
});
