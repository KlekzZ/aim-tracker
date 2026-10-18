// Answers one question from the local AI coach: finds the most relevant
// knowledge chunks (retrieval-augmented generation) and asks Ollama's chat
// model to answer using only them, citing which ones it used.
const db = require('../core/db');
const { topMatches, bufferToFloats } = require('../core/retrieval');
const { buildStatsSummary } = require('../core/coach-context');
const ollama = require('./ollama');

// Why this is phrased so defensively: a small local model can state wrong
// things confidently. The rules here push it to lean on the cited sources,
// keep their uncertainty tags, and never pretend to be a doctor or to own
// the plan's safety rules (those stay in the app's own code, not the AI).
const SYSTEM_PROMPT = `Du er en lokal aim-trænings-coach til KovaaK's og CS2, der kører offline på spillerens egen computer.
Svar altid på dansk, kort og konkret, i et afslappet men præcist sprog.
Brug kun de nummererede kilder i KONTEKST til faktapåstande, og henvis til dem som [1], [2] osv. Opfind aldrig et studie, en kilde eller et scenarienavn, der ikke står i konteksten.
Kilderne har evidens-mærker som [Study], [Official guide], [Creator advice], [Community] eller [Own judgement]. Gengiv den usikkerhed i dit svar i stedet for at præsentere alt som fakta.
Du bestemmer ikke planen. Regler om hvile, deload og smerte styres af appens egen kode, ikke af dig. Nævner spilleren smerte, så anbefal at stoppe og se en fysioterapeut ved vedvarende symptomer. Du er ikke læge og må ikke diagnosticere.
Hvis konteksten ikke svarer på spørgsmålet, så sig det ærligt i stedet for at gætte.`;

const MIN_SCORE = 0.2; // below this, a chunk is probably not actually relevant

async function ask(database, question, options) {
  const { embedModel, chatModel, includeStats, data, onToken } = options;
  if (!(await ollama.isRunning())) throw new Error('Ollama kører ikke. Start Ollama og prøv igen.');

  const rows = db.allChunksWithEmbeddings(database, embedModel);
  if (!rows.length) throw new Error('Ingen kilder er klar endnu. Tilføj en kilde under Kilder, og vent på at den bliver indekseret.');
  const chunks = rows.map((row) => ({ ...row, embedding: bufferToFloats(row.embedding) }));

  const [queryEmbedding] = await ollama.embedBatch(embedModel, [question]);
  const top = topMatches(queryEmbedding, chunks, 6).filter((m) => m.score > MIN_SCORE);

  const context = top.length
    ? top.map((m, i) => `[${i + 1}] ${m.chunk.headingPath || m.chunk.metaTitle || 'Kilde'}\n${m.chunk.text}`).join('\n\n---\n\n')
    : '(Ingen af kilderne matcher spørgsmålet godt. Sig det ærligt i stedet for at gætte videre.)';
  const statsBlock = includeStats ? `\n\nSPILLERENS NUVÆRENDE TAL:\n${buildStatsSummary(data)}` : '';

  // The language rule is repeated right at the end: the last instruction is
  // the one a small model is most likely to follow.
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `KONTEKST:\n${context}${statsBlock}\n\nSPØRGSMÅL: ${question}\n\nSvar på dansk. Hele svaret skal være på dansk.` },
  ];

  const answer = await ollama.chat(chatModel, messages, onToken);
  const citations = top.map((m) => ({
    sourceId: m.chunk.sourceId, headingPath: m.chunk.headingPath,
    metaTitle: m.chunk.metaTitle, metaUrl: m.chunk.metaUrl, score: m.score,
  }));
  return { answer, citations };
}

module.exports = { ask, SYSTEM_PROMPT };
