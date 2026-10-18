// Tests for chunking a knowledge source and for the retrieval search.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chunkSource, wordCount } = require('../src/core/chunking');
const { cosineSimilarity, topMatches, floatsToBuffer, bufferToFloats } = require('../src/core/retrieval');

test('chunking: splits markdown by heading and keeps a breadcrumb', () => {
  const md = `# Doc Title\n\nIntro text.\n\n## Section A\n\nShort body.\n\n### Sub A1\n\nDeeper body.\n\n## Section B\n\nAnother body.\n`;
  const chunks = chunkSource(md, 'Doc Title');
  const byPath = Object.fromEntries(chunks.map((c) => [c.headingPath, c]));
  assert.ok(byPath['Doc Title'].text.includes('Intro text.'));
  assert.ok(byPath['Doc Title > Section A'].text.includes('Short body.'));
  assert.ok(byPath['Doc Title > Section A > Sub A1'].text.includes('Deeper body.'));
  // Every chunk is self-contained: it starts with a "Kilde:" line.
  assert.ok(chunks.every((c) => c.text.startsWith('Kilde: ')));
});

test('chunking: a heading with only subheadings produces no empty chunk', () => {
  const md = `# Doc\n\n## Parent\n\n### Child\n\nBody text.\n`;
  const chunks = chunkSource(md, 'Doc');
  assert.equal(chunks.some((c) => c.headingPath === 'Doc > Parent'), false);
  assert.equal(chunks.some((c) => c.headingPath === 'Doc > Parent > Child'), true);
});

test('chunking: long sections are split with word-overlap between pieces', () => {
  const paragraph = (n) => `Paragraph ${n} ` + 'word '.repeat(80);
  const md = `# Doc\n\n## Long section\n\n${[1, 2, 3, 4, 5, 6, 7, 8].map(paragraph).join('\n\n')}\n`;
  const chunks = chunkSource(md, 'Doc').filter((c) => c.headingPath === 'Doc > Long section');
  assert.ok(chunks.length >= 2);
  assert.ok(chunks[1].text.includes('(... '));
});

test('chunking: a Title/URL transcript list splits per video and keeps the url', () => {
  const text = [
    'Transcripts from creators:', '',
    'Viscose:', 'Title: First video', 'URL: https://youtu.be/aaa', '',
    '(0:00) Hello this is the first video. '.repeat(30), '',
    'MattyOW:', 'Title: Second video', 'URL: https://youtu.be/bbb', '',
    '(0:00) Hello this is the second video. '.repeat(30), '',
  ].join('\n');
  const chunks = chunkSource(text, 'Transcripts');
  const first = chunks.filter((c) => c.metaTitle === 'First video');
  const second = chunks.filter((c) => c.metaTitle === 'Second video');
  assert.ok(first.length >= 1 && second.length >= 1);
  assert.equal(first[0].metaUrl, 'https://youtu.be/aaa');
  assert.ok(first[0].text.includes('Viscose'));
  assert.ok(first[0].text.includes('First video'));
  assert.ok(!first[0].text.includes('second video'));
});

test('chunking: plain text without headings falls back to paragraph splitting', () => {
  const text = ['Paragraph one.', '', 'Paragraph two.'].join('\n');
  const chunks = chunkSource(text, 'Notes');
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].text.includes('Paragraph one.'));
  assert.ok(chunks[0].text.includes('Paragraph two.'));
});

test('wordCount counts whitespace-separated words', () => {
  assert.equal(wordCount('  a b   c  '), 3);
  assert.equal(wordCount(''), 0);
});

test('retrieval: cosine similarity picks the closest vector', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
  assert.ok(cosineSimilarity([1, 0], [-1, 0]) < 0);
});

test('retrieval: topMatches returns the k closest chunks, best first', () => {
  const chunks = [
    { id: 'a', embedding: [1, 0] },
    { id: 'b', embedding: [0.9, 0.1] },
    { id: 'c', embedding: [0, 1] },
  ];
  const top = topMatches([1, 0], chunks, 2);
  assert.deepEqual(top.map((t) => t.chunk.id), ['a', 'b']);
  assert.ok(top[0].score > top[1].score);
});

test('retrieval: embeddings round-trip through a Buffer unchanged', () => {
  const floats = [0.1, -2.5, 3.333, 0, -0.0001];
  const buffer = floatsToBuffer(floats);
  const back = Array.from(bufferToFloats(buffer));
  floats.forEach((f, i) => assert.ok(Math.abs(f - back[i]) < 1e-5));
});
