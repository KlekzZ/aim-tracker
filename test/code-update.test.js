// Tests for the code-only update rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewer, manifestProblem } = require('../src/core/code-update');

test('isNewer compares versions as numbers', () => {
  assert.equal(isNewer('0.10.0', '0.9.3'), true);
  assert.equal(isNewer('0.5.0', '0.5.0'), false);
  assert.equal(isNewer('0.4.9', '0.5.0'), false);
  assert.equal(isNewer('1.0.0', '0.99.99'), true);
});

const good = { version: '0.5.0', file: 'app-0.5.0.asar', sha512: 'a'.repeat(128), electron: '44.9.0' };

test('a correct manifest for the same Electron major is accepted', () => {
  assert.equal(manifestProblem(good, '44.2.1'), null);
});

test('a manifest for another Electron major needs a new installer', () => {
  assert.match(manifestProblem({ ...good, electron: '45.0.0' }, '44.9.0'), /ny installer/);
});

test('broken or suspicious manifests are rejected', () => {
  assert.ok(manifestProblem({ ...good, file: '../../evil.asar' }, '44.9.0'));
  assert.ok(manifestProblem({ ...good, sha512: 'xyz' }, '44.9.0'));
  assert.ok(manifestProblem(null, '44.9.0'));
});
