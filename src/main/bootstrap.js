// The first file Electron runs. It decides which version of the app code to
// start: the code that came with the installer, or a newer code update that
// was downloaded from GitHub (see updater.js).
//
// Code updates live in %APPDATA%\Aim Tracker\code-updates\ as app-x.y.z.asar.
// Electron can load code straight from an .asar file, so we just require
// main.js from inside it.
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const { isNewer } = require('../core/code-update');
const { codeVersion } = require('./version');

function pickUpdate() {
  try {
    const dir = path.join(app.getPath('userData'), 'code-updates');
    const current = JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8'));
    const file = path.join(dir, current.file);
    // Only use it if it's newer than the code we already have.
    if (isNewer(current.version, codeVersion) && fs.existsSync(file)) return file;
  } catch {
    // No update downloaded yet, or the file is broken: use the built-in code.
  }
  return null;
}

const update = pickUpdate();
if (update) {
  try {
    require(path.join(update, 'src', 'main', 'main.js'));
  } catch (err) {
    // If the new code can't even start, fall back to the code we shipped with.
    console.error('Code update failed to start, using built-in code:', err);
    require('./main.js');
  }
} else {
  require('./main.js');
}
