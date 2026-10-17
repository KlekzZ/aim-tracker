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

  -- The post-session form.
  CREATE TABLE IF NOT EXISTS session_logs (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    focus_cue TEXT,
    tension INTEGER,
    pain INTEGER,
    note TEXT
  );
`;

function openDatabase(filePath) {
  const db = new DatabaseSync(filePath);
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

function addSessionLog(db, entry) {
  db.prepare(
    'INSERT INTO session_logs (created_at, focus_cue, tension, pain, note) VALUES (?, ?, ?, ?, ?)'
  ).run(entry.createdAt, entry.focusCue, entry.tension, entry.pain, entry.note);
}

// Newest first.
function sessionLogs(db) {
  return db.prepare('SELECT * FROM session_logs ORDER BY created_at DESC, id DESC').all();
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
  addSessionLog,
  sessionLogs,
};
