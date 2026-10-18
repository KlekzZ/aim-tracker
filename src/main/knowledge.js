// Importing knowledge sources and keeping their embeddings up to date.
// Read-only towards everything except the app's own database: it only reads
// a file the user picked and stores text in the local SQLite file.
const crypto = require('node:crypto');
const db = require('../core/db');
const { chunkSource } = require('../core/chunking');
const { floatsToBuffer } = require('../core/retrieval');
const ollama = require('./ollama');

function importSource(database, { title, kind, fileName, text }) {
  const trimmed = text.trim();
  if (!trimmed) return { added: false, reason: 'Filen er tom.' };

  const id = crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 16);
  const chunks = chunkSource(trimmed, title);
  if (!chunks.length) return { added: false, reason: 'Fandt ingen tekst at gemme.' };

  const added = db.addKnowledgeSource(database, { id, title, kind, fileName, charCount: trimmed.length, fullText: trimmed });
  if (!added) return { added: false, reason: 'Den kilde er allerede tilføjet.' };

  db.addKnowledgeChunks(database, id, chunks);
  return { added: true, chunkCount: chunks.length };
}

const EMBED_BATCH = 16;

// Embeds every chunk that has no embedding yet (or was embedded with an
// older model). Calls onProgress(done, total) as batches finish.
async function embedPendingChunks(database, embedModel, onProgress) {
  const total = db.countChunksNeedingEmbedding(database, embedModel);
  if (total === 0) return { embedded: 0 };

  let done = 0;
  for (;;) {
    const batch = db.chunksNeedingEmbedding(database, embedModel, EMBED_BATCH);
    if (!batch.length) break;
    const vectors = await ollama.embedBatch(embedModel, batch.map((chunk) => chunk.text));
    batch.forEach((chunk, i) => db.setChunkEmbedding(database, chunk.id, floatsToBuffer(vectors[i]), embedModel));
    done += batch.length;
    if (onProgress) onProgress(done, total);
  }
  return { embedded: done };
}

module.exports = { importSource, embedPendingChunks };
