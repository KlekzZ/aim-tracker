// The user's own settings (stats folder, auto-update on/off).
// Saved as settings.json in the app's data folder (%APPDATA%\Aim Tracker),
// never in the KovaaK's folder.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings(defaults) {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { ...defaults }; // first start, or the file is broken
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

module.exports = { loadSettings, saveSettings };
