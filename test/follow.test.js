// Tests for the program (data/program.json) and the "Følg planen" pointer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPasses, passProgress } = require('../src/core/program');
const follow = require('../src/core/follow');

const programData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'program.json'), 'utf8'));
const passes = buildPasses(programData);

// A tiny fake program: two passes of one scenario each, played 2 times.
const fakePass = (id, name, restAfter = false) => ({
  id, week: 1, block: 1, deload: false, restAfter,
  parts: [{ kind: 'scenarios', title: id, scenarios: [{ name, playCount: 2 }] }],
});
const tiny = [fakePass('p1', 'A'), fakePass('p2', 'B', true), fakePass('p3', 'C')];
const run = (scenario, playedAt) => ({ scenario, mode: 'Challenge', playedAt });

test('program: week 0 + 12 weeks of 6 passes, rest after each week', () => {
  assert.equal(passes.length, 1 + 12 * 6);
  assert.equal(passes[1].id, 'w1-Mon');
  assert.equal(passes[6].restAfter, true); // w1-Sat
});

test('program: Clicking I in odd weeks, II in even weeks', () => {
  assert.equal(passes.find((p) => p.id === 'w1-Tue').parts[0].code, 'KovaaKsCarryingGodlikeTile');
  assert.equal(passes.find((p) => p.id === 'w2-Tue').parts[0].code, 'KovaaKsCapturingGodlikeCamper');
});

test('program: Viscose day follows the block, deload Saturday is a test', () => {
  assert.match(passes.find((p) => p.id === 'w1-Fri').parts[0].title, /Control Tracking/);
  assert.match(passes.find((p) => p.id === 'w5-Fri').parts[0].title, /Evasive/);
  const w4sat = passes.find((p) => p.id === 'w4-Sat');
  assert.equal(w4sat.isTest, true);
  assert.equal(passes.find((p) => p.id === 'w8-Sat').parts.length, 2);
});

test('deload halves the runs, but not for tests', () => {
  const deloadPass = { ...fakePass('d', 'A'), deload: true };
  assert.equal(passProgress(deloadPass, [], {}, 0.5).parts[0].progress.totalNeed, 1);
  assert.equal(passProgress({ ...deloadPass, isTest: true }, [], {}, 0.5).parts[0].progress.totalNeed, 2);
});

test('pointer: stays on a pass until all runs are played, even across days', () => {
  let state = follow.startState(0, '2026-10-19');
  let result = follow.advance(state, tiny, [run('A', '2026-10-19T18:00:00')], {}, 0.5, '2026-10-19');
  assert.equal(result.state.index, 0);
  // Missed two days, then finished it: the pass waited.
  result = follow.advance(state, tiny, [run('A', '2026-10-19T18:00:00'), run('A', '2026-10-22T18:00:00')], {}, 0.5, '2026-10-22');
  state = result.state;
  assert.equal(state.index, 1);
  assert.equal(state.openedOn, '2026-10-23'); // next pass opens the day after
});

test('pointer: runs before the pass opened do not count', () => {
  const state = { index: 1, openedOn: '2026-10-20', history: [] };
  const result = follow.advance(state, tiny, [run('B', '2026-10-19T18:00:00'), run('B', '2026-10-19T18:05:00')], {}, 0.5, '2026-10-20');
  assert.equal(result.state.index, 1);
});

test('pointer: rest day after the last pass of the week', () => {
  const state = { index: 1, openedOn: '2026-10-20', history: [] };
  const runs = [run('B', '2026-10-20T18:00:00'), run('B', '2026-10-20T18:05:00')];
  const result = follow.advance(state, tiny, runs, {}, 0.5, '2026-10-20');
  assert.equal(result.state.openedOn, '2026-10-22'); // 21st is the rest day
  const view = follow.followView(result.state, tiny, runs, {}, 0.5, '2026-10-21');
  assert.equal(view.status, 'rest');
});

test('pointer: "Markér som gennemført" moves on without runs', () => {
  const state = follow.markDone(follow.startState(0, '2026-10-19'), tiny, '2026-10-19');
  assert.equal(state.index, 1);
  assert.equal(state.history[0].manual, true);
});
