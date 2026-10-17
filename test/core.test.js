// Tests for FOV math, settings warnings, plan weeks, sessions and ranks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { horizontalFov } = require('../src/core/fov');
const { checkRunSettings } = require('../src/core/settings-check');
const plan = require('../src/core/plan');
const stats = require('../src/core/stats');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data', 'config.json'), 'utf8'));
const planText = fs.readFileSync(path.join(root, 'docs', 'training-program.md'), 'utf8');

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.1, `${actual} != ${expected}`);

test('FOV: CS 90 on 4:3 is 90, on 16:9 it is 106.26', () => {
  near(horizontalFov(90, 'CSGO', 1280, 960), 90);
  near(horizontalFov(90, 'CSGO', 1920, 1080), 106.26);
});

test('FOV: Overwatch 103 is 103 on 16:9 but only ~86.6 on 4:3', () => {
  near(horizontalFov(103, 'Overwatch', 1920, 1080), 103);
  near(horizontalFov(103, 'Overwatch', 1280, 960), 86.6);
});

test('FOV: unknown scale returns null instead of guessing', () => {
  assert.equal(horizontalFov(103, 'SomethingNew', 1920, 1080), null);
});

const goodRun = { sensScale: 'CSGO', sens: 0.85, dpi: 800, fov: 103, fovScale: 'Overwatch', resolution: '1920x1080', width: 1920, height: 1080 };

test('settings: the planned setup gives no warnings', () => {
  assert.deepEqual(checkRunSettings(goodRun, config.expected_settings).warnings, []);
});

test('settings: the sample setup (1280x960, CS FOV 90) is flagged', () => {
  const run = { ...goodRun, fov: 90, fovScale: 'CSGO', resolution: '1280x960', width: 1280, height: 960 };
  const { warnings } = checkRunSettings(run, config.expected_settings);
  assert.ok(warnings.some((w) => w.includes('4:3')));
  assert.ok(warnings.some((w) => w.includes('Horisontal FOV')));
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
