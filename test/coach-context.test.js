// Tests for the short stats summary given to the AI coach's prompt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStatsSummary } = require('../src/core/coach-context');

const baseData = {
  radar: [], latestRun: null, today: { schedule: '', weekInfo: { week: null } },
  sessionLogs: [], restWarning: false,
};

test('summary lists the weakest Voltaic subcategories, best first omitted', () => {
  const data = { ...baseData, radar: [
    { subcategory: 'Control', current: 0.75 }, { subcategory: 'Reactive', current: 0.60 },
    { subcategory: 'Speed', current: 1.02 }, { subcategory: 'Evasive', current: 0.93 },
    { subcategory: 'Static', current: null },
  ] };
  const summary = buildStatsSummary(data);
  assert.match(summary, /Reactive: 60 %/);
  assert.match(summary, /Control: 75 %/);
  assert.doesNotMatch(summary, /Speed: 102 %/); // weakest 3 only, Speed is the strongest shown
});

test('summary includes the latest run and cm/360 when known', () => {
  const data = { ...baseData, latestRun: { scenario: 'VT Raw Control Intermediate S5', score: 2500, cm360: 61.1 } };
  assert.match(buildStatsSummary(data), /VT Raw Control Intermediate S5, score 2500, 61\.1 cm\/360/);
});

test('summary includes the plan week and today\'s schedule when following a week', () => {
  const data = { ...baseData, today: { schedule: 'VDIM Adept Tracking I', weekInfo: { week: 4, deload: true } } };
  assert.match(buildStatsSummary(data), /Uge 4 \(deload-uge\)/);
});

test('summary surfaces the rest warning and the last session log', () => {
  const data = { ...baseData, sessionLogs: [{ tension: 4, pain: 6, note: 'Hård session' }], restWarning: true };
  const summary = buildStatsSummary(data);
  assert.match(summary, /spænding 4\/5, smerte 6\/10, note: "Hård session"/);
  assert.match(summary, /OBS: smerte 5 eller mere/);
});

test('summary has a fallback when there is no data at all', () => {
  assert.equal(buildStatsSummary(baseData), 'Ingen data endnu.');
});
