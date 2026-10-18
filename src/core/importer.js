// Reads the KovaaK's stats folder and stores new runs in the database.
//
// READ-ONLY: this file only uses fs.readdir, fs.stat and fs.readFile.
// It never writes, moves, renames or deletes anything in the stats folder.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseStatsFile } = require('./parser');
const db = require('./db');

const STATS_FILE = /Stats\.csv$/i;

// Returns a summary like { files, added, problems } so the app can show it.
async function importFolder(database, statsDir) {
  const summary = { files: 0, added: 0, problems: 0 };
  const fileNames = (await fs.readdir(statsDir)).filter((name) => STATS_FILE.test(name));

  for (const fileName of fileNames) {
    summary.files++;
    const fullPath = path.join(statsDir, fileName);
    const info = await fs.stat(fullPath);
    if (db.isFileUnchanged(database, fileName, info.size, info.mtimeMs)) continue;

    const buffer = await fs.readFile(fullPath);
    const parsed = parseStatsFile(fileName, buffer.toString('utf8'));

    if (!parsed.ok) {
      db.setProblem(database, fileName, parsed.reason);
      summary.problems++;
      // Don't mark as seen: if KovaaK's was still writing the file, the next
      // scan will try again once it has changed.
      continue;
    }

    // Hash of the whole file, so the same run is never stored twice.
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (db.insertRun(database, parsed.run, fileHash)) summary.added++;
    db.clearProblem(database, fileName);
    db.markFileSeen(database, fileName, info.size, info.mtimeMs);
  }

  return summary;
}

// Works out the in-run details for runs stored before that feature existed,
// by reading their files again. Still read-only. A file that is gone gets
// an empty result, so we don't keep looking for it on every start.
async function backfillDetails(database, statsDir) {
  let filled = 0;
  for (const { id, fileName } of db.runsWithoutDetails(database)) {
    try {
      const text = await fs.readFile(path.join(statsDir, fileName), 'utf8');
      const parsed = parseStatsFile(fileName, text);
      db.setRunDetails(database, id, parsed.ok ? parsed.run.details : {});
      filled++;
    } catch {
      db.setRunDetails(database, id, {});
    }
  }
  return filled;
}

module.exports = { importFolder, backfillDetails };
