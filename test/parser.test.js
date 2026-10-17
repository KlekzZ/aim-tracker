// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseStatsFile, parseFileName } = require('../src/core/parser');

const SAMPLE_NAME = 'Piano Tiles I 50 SLOW - Challenge - 2026.10.17-12.08.07 Stats.csv';
const sampleText = fs.readFileSync(path.join(__dirname, '..', 'sample-data', SAMPLE_NAME), 'utf8');

test('reads score, scenario and settings from the sample file', () => {
  const result = parseStatsFile(SAMPLE_NAME, sampleText);
  assert.equal(result.ok, true);
  const run = result.run;
  assert.equal(run.score, 2.0);
  // The name inside the file wins over the file name ("50%" vs "50").
  assert.equal(run.scenario, 'Piano Tiles I 50% SLOW');
  assert.equal(run.mode, 'Challenge');
  assert.equal(run.playedAt, '2026-10-17T12:08:07');
  assert.equal(run.hits, 2);
  assert.equal(run.misses, 1);
  assert.ok(Math.abs(run.accuracy - 2 / 3) < 1e-9);
  assert.equal(run.sensScale, 'CSGO');
  assert.equal(run.sens, 0.85);
  assert.equal(run.dpi, 800);
  assert.equal(run.fov, 90);
  assert.equal(run.fovScale, 'CSGO');
  assert.equal(run.resolution, '1280x960');
  assert.equal(run.width, 1280);
  assert.equal(run.height, 960);
});

test('file name with " - " inside the scenario name', () => {
  const info = parseFileName('VT Pasu - Test - Challenge - 2026.10.20-18.30.00 Stats.csv');
  assert.equal(info.scenario, 'VT Pasu - Test');
  assert.equal(info.mode, 'Challenge');
});

test('non-Challenge files are parsed and keep their mode', () => {
  const result = parseStatsFile('Tile Frenzy - Freeplay - 2026.10.20-18.30.00 Stats.csv', sampleText);
  assert.equal(result.ok, true);
  assert.equal(result.run.mode, 'Freeplay');
});

test('bad file name is a problem, not a crash', () => {
  const result = parseStatsFile('random.csv', sampleText);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Filnavnet/);
});

test('missing Score line is a problem, not a crash', () => {
  const half = sampleText.split('Score:')[0];
  const result = parseStatsFile(SAMPLE_NAME, half);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Score/);
});
