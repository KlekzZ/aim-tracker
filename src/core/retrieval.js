// Finds the knowledge chunks most relevant to a question, given their
// embeddings. Plain cosine-similarity search in JS: fast enough for the size
// of knowledge base one player collects (at most a few thousand chunks), and
// needs no extra database or native module.

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// chunks: [{ embedding: number[] | Float32Array, ... }]. Returns the top k,
// each as { chunk, score }, highest score first.
function topMatches(queryEmbedding, chunks, k = 6) {
  return chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Embeddings are stored as a Buffer of 32-bit floats (compact, fast to read
// back), not as JSON text.
const floatsToBuffer = (floats) => Buffer.from(Float32Array.from(floats).buffer);
const bufferToFloats = (buffer) => new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);

module.exports = { cosineSimilarity, topMatches, floatsToBuffer, bufferToFloats };
