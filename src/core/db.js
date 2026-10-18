// Local SQLite database using Node's built-in "node:sqlite" (no extra package).
// The database lives in the app's own data folder, never in the KovaaK's folder.
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
  -- One row per KovaaK's run. file_hash is UNIQUE, so reading the same file
  -- twice (or a copy of it) can never create a duplicate.
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    file_hash TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    scenario TEXT NOT NULL,
    mode TEXT,
    played_at TEXT NOT NULL,
    score REAL NOT NULL,
    kills REAL, hits REAL, misses REAL, accuracy REAL,
    sens_scale TEXT, sens REAL, vert_sens REAL, dpi REAL,
    fov REAL, fov_scale TEXT, resolution TEXT, width INTEGER, height INTEGER,
    avg_fps REAL, game_version TEXT
  );
  CREATE INDEX IF NOT EXISTS runs_scenario ON runs (scenario, played_at);

  -- Files we already looked at. If name, size and change time are the same,
  -- we skip reading the file again on the next scan.
  CREATE TABLE IF NOT EXISTS seen_files (
    file_name TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime_ms REAL NOT NULL
  );

  -- Files that could not be parsed, with a reason shown in the app.
  CREATE TABLE IF NOT EXISTS problems (
    file_name TEXT PRIMARY KEY,
    reason TEXT NOT NULL
  );

  -- Playlists looked up on kovaaks.com, saved so the app works offline.
  -- scenarios is JSON: [{ "name": "...", "playCount": 2 }, ...]
  CREATE TABLE IF NOT EXISTS playlists (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scenarios TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  -- Small app state as JSON by key, e.g. where you are in the plan ("follow").
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- The post-session form.
  CREATE TABLE IF NOT EXISTS session_logs (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    focus_cue TEXT,
    tension INTEGER,
    pain INTEGER,
    note TEXT
  );

  -- Knowledge sources for the local AI coach: notes and transcripts the user
  -- adds by hand ("Tilføj kilde"). id is a content hash, so re-adding the
  -- same file is a no-op instead of a duplicate. Never synced anywhere.
  CREATE TABLE IF NOT EXISTS knowledge_sources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_name TEXT,
    added_at TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    full_text TEXT NOT NULL
  );

  -- One row per chunk of a source. embedding is a BLOB of 32-bit floats,
  -- filled in once Ollama's embedding model has processed the chunk;
  -- embedding_model records which model, so chunks from an old model are
  -- never mixed with a new one in a similarity search.
  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id INTEGER PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    heading_path TEXT,
    meta_title TEXT,
    meta_url TEXT,
    text TEXT NOT NULL,
    embedding BLOB,
    embedding_model TEXT
  );
  CREATE INDEX IF NOT EXISTS knowledge_chunks_source ON knowledge_chunks (source_id);

  -- Chat history with the local coach, so it survives an app restart.
  CREATE TABLE IF NOT EXISTS coach_messages (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    citations TEXT
  );
`;

function openDatabase(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

function isFileUnchanged(db, fileName, size, mtimeMs) {
  const row = db.prepare('SELECT size, mtime_ms FROM seen_files WHERE file_name = ?').get(fileName);
  return Boolean(row && row.size === size && row.mtime_ms === mtimeMs);
}

function markFileSeen(db, fileName, size, mtimeMs) {
  db.prepare(
    'INSERT OR REPLACE INTO seen_files (file_name, size, mtime_ms) VALUES (?, ?, ?)'
  ).run(fileName, size, mtimeMs);
}

function setProblem(db, fileName, reason) {
  db.prepare('INSERT OR REPLACE INTO problems (file_name, reason) VALUES (?, ?)').run(fileName, reason);
}

function clearProblem(db, fileName) {
  db.prepare('DELETE FROM problems WHERE file_name = ?').run(fileName);
}

// Returns true if the run was new, false if it was already stored.
function insertRun(db, run, fileHash) {
  const result = db.prepare(`
    INSERT OR IGNORE INTO runs (
      file_hash, file_name, scenario, mode, played_at, score,
      kills, hits, misses, accuracy,
      sens_scale, sens, vert_sens, dpi, fov, fov_scale, resolution, width, height,
      avg_fps, game_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fileHash, run.fileName, run.scenario, run.mode, run.playedAt, run.score,
    run.kills, run.hits, run.misses, run.accuracy,
    run.sensScale, run.sens, run.vertSens, run.dpi, run.fov, run.fovScale, run.resolution, run.width, run.height,
    run.avgFps, run.gameVersion
  );
  return result.changes > 0;
}

// Column names are renamed to the same camelCase names the parser uses,
// so the rest of the app only has to know one set of names.
function allRuns(db) {
  return db.prepare(`
    SELECT id, file_name AS fileName, scenario, mode, played_at AS playedAt, score,
      kills, hits, misses, accuracy,
      sens_scale AS sensScale, sens, vert_sens AS vertSens, dpi,
      fov, fov_scale AS fovScale, resolution, width, height,
      avg_fps AS avgFps, game_version AS gameVersion
    FROM runs ORDER BY played_at
  `).all();
}

function allProblems(db) {
  return db.prepare('SELECT * FROM problems ORDER BY file_name').all();
}

function savePlaylist(db, playlist) {
  db.prepare(
    'INSERT OR REPLACE INTO playlists (code, name, scenarios, fetched_at) VALUES (?, ?, ?, ?)'
  ).run(playlist.code, playlist.name, JSON.stringify(playlist.scenarios), new Date().toISOString());
}

// All cached playlists as { code: { code, name, scenarios, fetchedAt } }.
function allPlaylists(db) {
  const result = {};
  for (const row of db.prepare('SELECT * FROM playlists').all()) {
    result[row.code] = { code: row.code, name: row.name, scenarios: JSON.parse(row.scenarios), fetchedAt: row.fetched_at };
  }
  return result;
}

function getState(db, key) {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function setState(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

function addSessionLog(db, entry) {
  db.prepare(
    'INSERT INTO session_logs (created_at, focus_cue, tension, pain, note) VALUES (?, ?, ?, ?, ?)'
  ).run(entry.createdAt, entry.focusCue, entry.tension, entry.pain, entry.note);
}

// Newest first.
function sessionLogs(db) {
  return db.prepare('SELECT * FROM session_logs ORDER BY created_at DESC, id DESC').all();
}

// ---------- Knowledge base (local AI coach) ----------

// Returns false if a source with this id (content hash) already exists.
function addKnowledgeSource(db, source) {
  const result = db.prepare(`
    INSERT OR IGNORE INTO knowledge_sources (id, title, kind, file_name, added_at, char_count, full_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(source.id, source.title, source.kind, source.fileName, new Date().toISOString(), source.charCount, source.fullText);
  return result.changes > 0;
}

function removeKnowledgeSource(db, id) {
  db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id);
}

// Sources with how many chunks each has and how many still need embedding.
function allKnowledgeSources(db) {
  return db.prepare(`
    SELECT s.id, s.title, s.kind, s.file_name AS fileName, s.added_at AS addedAt, s.char_count AS charCount,
      COUNT(c.id) AS chunkCount,
      SUM(CASE WHEN c.embedding IS NULL THEN 1 ELSE 0 END) AS pendingCount
    FROM knowledge_sources s LEFT JOIN knowledge_chunks c ON c.source_id = s.id
    GROUP BY s.id ORDER BY s.added_at DESC
  `).all();
}

function addKnowledgeChunks(db, sourceId, chunks) {
  const insert = db.prepare(`
    INSERT INTO knowledge_chunks (source_id, ordinal, heading_path, meta_title, meta_url, text)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  chunks.forEach((chunk, i) => insert.run(sourceId, i, chunk.headingPath, chunk.metaTitle, chunk.metaUrl, chunk.text));
}

// Chunks with no embedding yet, or embedded with an older model.
function chunksNeedingEmbedding(db, model, limit) {
  return db.prepare(`
    SELECT id, text FROM knowledge_chunks
    WHERE embedding IS NULL OR embedding_model IS NOT ? LIMIT ?
  `).all(model, limit);
}

function countChunksNeedingEmbedding(db, model) {
  return db.prepare('SELECT COUNT(*) AS n FROM knowledge_chunks WHERE embedding IS NULL OR embedding_model IS NOT ?').get(model).n;
}

function setChunkEmbedding(db, chunkId, embeddingBuffer, model) {
  db.prepare('UPDATE knowledge_chunks SET embedding = ?, embedding_model = ? WHERE id = ?').run(embeddingBuffer, model, chunkId);
}

// All chunks ready for search with the given embedding model.
function allChunksWithEmbeddings(db, model) {
  return db.prepare(`
    SELECT id, source_id AS sourceId, heading_path AS headingPath, meta_title AS metaTitle, meta_url AS metaUrl, text, embedding
    FROM knowledge_chunks WHERE embedding_model = ?
  `).all(model);
}

function addCoachMessage(db, message) {
  db.prepare('INSERT INTO coach_messages (created_at, role, content, citations) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), message.role, message.content, message.citations ? JSON.stringify(message.citations) : null);
}

function coachMessages(db) {
  return db.prepare('SELECT id, created_at AS createdAt, role, content, citations FROM coach_messages ORDER BY id').all()
    .map((row) => ({ ...row, citations: row.citations ? JSON.parse(row.citations) : null }));
}

function clearCoachMessages(db) {
  db.prepare('DELETE FROM coach_messages').run();
}

module.exports = {
  openDatabase,
  isFileUnchanged,
  markFileSeen,
  setProblem,
  clearProblem,
  insertRun,
  allRuns,
  allProblems,
  savePlaylist,
  allPlaylists,
  getState,
  setState,
  addSessionLog,
  sessionLogs,
  addKnowledgeSource,
  removeKnowledgeSource,
  allKnowledgeSources,
  addKnowledgeChunks,
  chunksNeedingEmbedding,
  countChunksNeedingEmbedding,
  setChunkEmbedding,
  allChunksWithEmbeddings,
  addCoachMessage,
  coachMessages,
  clearCoachMessages,
};
