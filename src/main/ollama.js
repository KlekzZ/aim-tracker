// Talks to a local Ollama server on 127.0.0.1 only (approved in CLAUDE.md).
// Ollama runs the models entirely on this machine, so nothing about the
// player or their data ever leaves the computer.
const fs = require('node:fs');
const path = require('node:path');
const { net } = require('electron');

const BASE_URL = 'http://127.0.0.1:11434';

// Where the Windows installer puts Ollama. We look for the file so the app
// can tell "not installed" apart from "installed but not started" and show
// the right help instead of a generic error.
function findInstallation() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || '', 'Ollama', 'ollama app.exe'),
  ];
  return candidates.find((file) => { try { return fs.existsSync(file); } catch { return false; } }) || null;
}

async function isRunning() {
  try {
    const response = await net.fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Installed model names, e.g. ["qwen2.5:14b-instruct", "nomic-embed-text:latest"].
async function listModels() {
  const response = await net.fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Ollama svarede ${response.status}`);
  const body = await response.json();
  return (body.models || []).map((m) => m.name);
}

// True if `installed` contains `wanted`, allowing "name" to match "name:tag".
function hasModel(installed, wanted) {
  return installed.some((name) => name === wanted || name.startsWith(`${wanted}:`));
}

// One embedding vector (array of floats) per input string.
async function embedBatch(model, texts) {
  const response = await net.fetch(`${BASE_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Ollama embedding fejlede (${response.status}). Er modellen "${model}" hentet?`);
  const body = await response.json();
  return body.embeddings;
}

// Streams an assistant reply. Calls onToken(text) as pieces arrive and
// resolves with the full text when done.
//
// num_ctx matters a lot here: Ollama's default context is small, and when the
// prompt (system rules + six knowledge chunks) doesn't fit, the start is cut
// off. The model then loses the "answer in Danish" rule and drifts into
// another language. A low temperature keeps it close to the sources.
// This is sent with every request, so it overrides whatever context length
// is set in the Ollama app itself (its default is 4096, too small for us).
const CHAT_OPTIONS = { temperature: 0.3, num_ctx: 12288 };

async function chat(model, messages, onToken) {
  const response = await net.fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, options: CHAT_OPTIONS }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok || !response.body) throw new Error(`Ollama chat fejlede (${response.status}). Er modellen "${model}" hentet?`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineAt;
    while ((newlineAt = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineAt).trim();
      buffer = buffer.slice(newlineAt + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      const piece = event.message && event.message.content;
      if (piece) { full += piece; onToken(piece); }
      if (event.done) return full;
    }
  }
  return full;
}

// Downloads a model through the local Ollama server, so the user doesn't
// have to open a terminal. Ollama itself does the downloading; the app only
// talks to 127.0.0.1. onProgress({ status, percent }) is called as it runs.
async function pullModel(model, onProgress) {
  const response = await net.fetch(`${BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal: AbortSignal.timeout(3600000), // a big model on a slow line
  });
  if (!response.ok || !response.body) throw new Error(`Download fejlede (${response.status})`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineAt;
    while ((newlineAt = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineAt).trim();
      buffer = buffer.slice(newlineAt + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      onProgress({
        status: event.status || '',
        percent: event.total ? Math.round(((event.completed || 0) / event.total) * 100) : null,
      });
    }
  }
}

module.exports = { isRunning, listModels, hasModel, embedBatch, chat, pullModel, findInstallation, BASE_URL };
