// Tests for the knowledge-base tables (sources, chunks, embeddings, chat log).
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/core/db');
const { floatsToBuffer, bufferToFloats } = require('../src/core/retrieval');

const openTestDb = () => db.openDatabase(':memory:');

test('sources: adding the same id twice is a no-op (content-hash dedupe)', () => {
  const database = openTestDb();
  const source = { id: 'abc123', title: 'Test note', kind: 'note', fileName: 'test.md', charCount: 10, fullText: 'hello' };
  assert.equal(db.addKnowledgeSource(database, source), true);
  assert.equal(db.addKnowledgeSource(database, source), false);
  assert.equal(db.allKnowledgeSources(database).length, 1);
});

test('chunks: counted per source, pending count reflects missing embeddings', () => {
  const database = openTestDb();
  db.addKnowledgeSource(database, { id: 's1', title: 'Doc', kind: 'note', fileName: null, charCount: 1, fullText: 'x' });
  db.addKnowledgeChunks(database, 's1', [
    { headingPath: 'Doc', metaTitle: null, metaUrl: null, text: 'chunk one' },
    { headingPath: 'Doc', metaTitle: null, metaUrl: null, text: 'chunk two' },
  ]);
  const sources = db.allKnowledgeSources(database);
  assert.equal(sources[0].chunkCount, 2);
  assert.equal(sources[0].pendingCount, 2);
});

test('deleting a source cascades to its chunks', () => {
  const database = openTestDb();
  db.addKnowledgeSource(database, { id: 's1', title: 'Doc', kind: 'note', fileName: null, charCount: 1, fullText: 'x' });
  db.addKnowledgeChunks(database, 's1', [{ headingPath: 'Doc', metaTitle: null, metaUrl: null, text: 'chunk' }]);
  db.removeKnowledgeSource(database, 's1');
  assert.equal(db.allKnowledgeSources(database).length, 0);
  assert.equal(db.countChunksNeedingEmbedding(database, 'any-model'), 0);
});

test('embeddings: stored as a BLOB and read back as the same floats', () => {
  const database = openTestDb();
  db.addKnowledgeSource(database, { id: 's1', title: 'Doc', kind: 'note', fileName: null, charCount: 1, fullText: 'x' });
  db.addKnowledgeChunks(database, 's1', [{ headingPath: 'Doc', metaTitle: null, metaUrl: null, text: 'chunk' }]);

  const pending = db.chunksNeedingEmbedding(database, 'nomic-embed-text', 10);
  assert.equal(pending.length, 1);

  const floats = [0.25, -1.5, 3.0, 0.0001];
  db.setChunkEmbedding(database, pending[0].id, floatsToBuffer(floats), 'nomic-embed-text');

  assert.equal(db.countChunksNeedingEmbedding(database, 'nomic-embed-text'), 0);
  // A different model name means these chunks count as "needing embedding" again.
  assert.equal(db.countChunksNeedingEmbedding(database, 'another-model'), 1);

  const ready = db.allChunksWithEmbeddings(database, 'nomic-embed-text');
  assert.equal(ready.length, 1);
  const back = Array.from(bufferToFloats(ready[0].embedding));
  floats.forEach((f, i) => assert.ok(Math.abs(f - back[i]) < 1e-5));
});

test('coach messages: stored in order with optional citations', () => {
  const database = openTestDb();
  db.addCoachMessage(database, { role: 'user', content: 'Hej' });
  db.addCoachMessage(database, { role: 'assistant', content: 'Svar', citations: [{ sourceId: 's1' }] });
  const messages = db.coachMessages(database);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, 'Hej');
  assert.equal(messages[1].citations[0].sourceId, 's1');

  db.clearCoachMessages(database);
  assert.equal(db.coachMessages(database).length, 0);
});
