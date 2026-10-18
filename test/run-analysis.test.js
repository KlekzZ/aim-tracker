// Tests for the in-run analysis, progress-vs-noise, records, weekly summary
// and the sens advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeKills, trendSignal, findRecords, weeklySummary } = require('../src/core/run-analysis');
const { recommendSens } = require('../src/core/sens-advice');
const { sensForCm, cmPer360 } = require('../src/core/sens');
const { parseStatsFile, parseKillRows } = require('../src/core/parser');

const normalize = (n) => n.trim().replace(/\s+/g, ' ').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const at = (sec) => `09:${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}.000`;

test('kill rows: the sample file has two kills, tracking files have none', () => {
  const sample = fs.readFileSync(path.join(__dirname, '..', 'sample-data', 'Piano Tiles I 50 SLOW - Challenge - 2026.10.17-12.08.07 Stats.csv'), 'utf8');
  const rows = parseKillRows(sample);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].hits, 1);
  assert.equal(parseKillRows('Weapon,Shots\nfoo,1\n').length, 0);
});

test('kill analysis: a run that slows down shows it in the second half', () => {
  // 40 kills in the first 30 s, 20 in the last 30 s, start 09:00:00, end 09:01:00.
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push({ time: at(i * 0.75), ttk: 0.5, shots: 1, hits: 1 });
  for (let i = 0; i < 20; i++) rows.push({ time: at(30 + i * 1.5), ttk: 0.5, shots: 2, hits: 1 });
  const result = analyzeKills(rows, '09:00:00.000', '2026-10-18T09:01:00');
  assert.equal(result.kills, 60);
  assert.equal(result.duration, 60);
  assert.equal(result.firstHalf.kills, 40);
  assert.equal(result.secondHalf.kills, 20);
  assert.equal(result.firstHalf.accuracy, 1);
  assert.equal(result.secondHalf.accuracy, 0.5);
  assert.equal(result.curve.length, 6);
  assert.ok(result.curve[0] > result.curve[5]);
});

test('kill analysis: long gaps are counted as slow kills', () => {
  const rows = [0, 1, 2, 3, 4, 15, 16, 17].map((s) => ({ time: at(s), ttk: 0.5, shots: 1, hits: 1 }));
  const result = analyzeKills(rows, '09:00:00.000', '2026-10-18T09:00:20');
  assert.equal(result.slowKills, 1);
  assert.equal(result.medianGap, 1);
});

test('kill analysis: no rows (tracking) gives kills 0 and nothing else', () => {
  assert.deepEqual(analyzeKills([], '09:00:00', '2026-10-18T09:01:00'), { kills: 0 });
});

test('parser attaches the run details', () => {
  const text = 'Kill #,Timestamp,Bot,Weapon,TTK,Shots,Hits\n1,09:00:10.000,b,w,0.1s,1,1\n2,09:00:20.000,b,w,0.1s,1,0\n\nScore:,5\nChallenge Start:,09:00:00.000\n';
  const result = parseStatsFile('X - Challenge - 2026.10.18-09.01.00 Stats.csv', text);
  assert.equal(result.run.details.kills, 2);
  assert.equal(result.run.details.duration, 60);
});

test('trend: too few runs says so instead of guessing', () => {
  assert.equal(trendSignal([1, 2, 3]).status, 'few');
});

test('trend: a jump bigger than the normal spread is real progress', () => {
  assert.equal(trendSignal([100, 102, 98, 101, 99, 100, 120, 121, 119]).status, 'up');
});

test('trend: a small wobble inside the normal spread is noise', () => {
  assert.equal(trendSignal([100, 110, 90, 105, 95, 100, 103, 99, 104]).status, 'flat');
});

test('trend: a drop bigger than the spread is flagged down', () => {
  assert.equal(trendSignal([100, 101, 99, 100, 101, 99, 85, 86, 84]).status, 'down');
});

test('records: first run is not a record, later better runs are, with rank-ups', () => {
  const ladders = new Map([['a', { thresholds: [100, 200], ranks: ['Plat', 'Dia'] }]]);
  const run = (score, t) => ({ scenario: 'A', mode: 'Challenge', score, playedAt: `2026-10-18T09:00:0${t}` });
  const events = findRecords([run(90, 1), run(80, 2), run(110, 3), run(105, 4), run(210, 5)], ladders, normalize);
  assert.equal(events.length, 2);
  assert.equal(events[0].score, 210); // newest first
  assert.equal(events[0].rank, 'Dia');
  assert.equal(events[1].rank, 'Plat'); // 90 -> 110 crosses Platinum
});

test('weekly summary compares medians of scenarios played in both weeks', () => {
  const run = (scenario, score, date) => ({ scenario, mode: 'Challenge', score, playedAt: `${date}T10:00:00` });
  const runs = [
    run('A', 100, '2026-10-08'), run('A', 100, '2026-10-09'),
    run('A', 120, '2026-10-17'), run('A', 120, '2026-10-18'),
    run('B', 50, '2026-10-08'), run('B', 40, '2026-10-17'),
  ];
  const summary = weeklySummary(runs, [], '2026-10-18', normalize);
  assert.equal(summary.runs, 3);
  assert.equal(summary.runsLastWeek, 3);
  assert.equal(summary.days, 2);
  assert.equal(summary.improved[0].scenario, 'A');
  assert.equal(summary.dropped[0].scenario, 'B');
});

test('sens: converting back and forth gives the same cm/360', () => {
  assert.equal(sensForCm(61.1, 'CSGO', 800), 0.85);
  assert.ok(Math.abs(cmPer360(sensForCm(45, 'CSGO', 800), 'CSGO', 800) - 45) < 0.3);
  assert.equal(sensForCm(50, 'Unknown', 800), null);
});

const info = new Map([['a', { subcategory: 'Control', reference: 1000 }], ['b', { subcategory: 'Control', reference: 2000 }]]);
const r = (scenario, score, cm360) => ({ scenario, mode: 'Challenge', score, cm360 });

test('sens advice: picks the sens that scored clearly best on this scenario', () => {
  const runs = [r('A', 900, 61.1), r('A', 910, 61.1), r('A', 905, 61.1), r('A', 1000, 52), r('A', 1010, 52)];
  const advice = recommendSens({ name: 'A' }, runs, info, normalize);
  assert.equal(advice.cm, 52);
  assert.equal(advice.basis, 'scenario');
  assert.ok(advice.gain > 0.03);
});

test('sens advice: sticks with your usual sens when the other is not clearly better', () => {
  const runs = [r('A', 900, 61.1), r('A', 910, 61.1), r('A', 905, 61.1), r('A', 912, 52), r('A', 908, 52)];
  assert.equal(recommendSens({ name: 'A' }, runs, info, normalize).cm, 61);
});

test('sens advice: falls back to similar scenarios, compared fairly by reference', () => {
  // B is a different scenario in the same subcategory, with a bigger score scale.
  const runs = [r('B', 1600, 61.1), r('B', 1620, 61.1), r('B', 1900, 57.7), r('B', 1880, 57.7), r('A', 500, 61.1)];
  const advice = recommendSens({ name: 'A', subcategory: 'Control' }, runs, info, normalize);
  assert.equal(advice.basis, 'similar');
  assert.equal(advice.cm, 57.5);
});

test('sens advice: Fingertip rule wins over a slower usual sens', () => {
  const runs = [r('A', 900, 61.1), r('A', 910, 61.1)];
  const advice = recommendSens({ name: 'Z', maxCm360: 50 }, runs, info, normalize);
  assert.equal(advice.basis, 'rule');
  assert.ok(advice.cm <= 50);
});
