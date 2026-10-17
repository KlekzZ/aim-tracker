// Electron main process: opens the window, scans and watches the stats
// folder, and answers the page's requests.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const db = require('../core/db');
const { importFolder } = require('../core/importer');
const { buildData, config } = require('./data-service');
const { loadSettings, saveSettings } = require('./app-settings');
const updater = require('./updater');

let window = null;
let database = null;
let settings = null;
let watcher = null;
let lastScan = { at: null, summary: null, error: null };
let updateStatus = { text: '', canInstall: false };

function notifyPage(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

async function scan() {
  try {
    const summary = await importFolder(database, settings.statsDir);
    lastScan = { at: new Date().toISOString(), summary, error: null };
  } catch (err) {
    lastScan = { at: new Date().toISOString(), summary: null, error: `Kunne ikke læse mappen: ${err.message}` };
  }
  notifyPage('data-changed');
}

// fs.watch only tells us something changed. We wait a moment (KovaaK's
// might still be writing) and then scan. Watching does not change any files.
function watchStatsFolder() {
  if (watcher) watcher.close();
  watcher = null;
  let waitTimer = null;
  try {
    watcher = fs.watch(settings.statsDir, () => {
      clearTimeout(waitTimer);
      waitTimer = setTimeout(scan, 1500);
    });
    watcher.on('error', () => {}); // e.g. the folder was removed; the next scan shows the error
  } catch {
    // Folder doesn't exist. scan() reports it on the page.
  }
}

function startUpdater() {
  updater.startUpdater(settings.autoUpdate, (text, canInstall) => {
    updateStatus = { text, canInstall };
    notifyPage('update-status', updateStatus);
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Aim Tracker',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Safety: the page runs without Node access, isolated from this process.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // The page may never open other websites or navigate away.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function registerIpc() {
  ipcMain.handle('get-data', () =>
    buildData(database, {
      statsDir: settings.statsDir,
      autoUpdate: settings.autoUpdate,
      appVersion: app.getVersion(),
      lastScan,
      updateStatus,
    })
  );

  ipcMain.handle('rescan', () => scan());

  ipcMain.handle('save-session-log', (_event, entry) => {
    // Clamp the numbers so a typo can't store nonsense.
    const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
    db.addSessionLog(database, {
      createdAt: new Date().toISOString(),
      focusCue: String(entry.focusCue || '').slice(0, 200),
      tension: clamp(entry.tension, 1, 5),
      pain: clamp(entry.pain, 0, 10),
      note: String(entry.note || '').slice(0, 1000),
    });
    notifyPage('data-changed');
  });

  ipcMain.handle('choose-stats-dir', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Vælg KovaaK\'s stats-mappe',
      defaultPath: settings.statsDir,
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return;
    settings.statsDir = result.filePaths[0];
    saveSettings(settings);
    watchStatsFolder();
    await scan();
  });

  ipcMain.handle('set-auto-update', (_event, enabled) => {
    settings.autoUpdate = Boolean(enabled);
    saveSettings(settings);
    startUpdater();
  });

  ipcMain.handle('check-for-update', () => startUpdater());
  ipcMain.handle('install-update', () => updater.installNow());
}

app.whenReady().then(async () => {
  settings = loadSettings({ statsDir: config.default_stats_dir_windows, autoUpdate: true });
  // The database file lives in %APPDATA%\Aim Tracker, not in the KovaaK's folder.
  database = db.openDatabase(path.join(app.getPath('userData'), 'aim-tracker.sqlite'));

  registerIpc();
  createWindow();
  await scan();
  watchStatsFolder();
  startUpdater();
});

app.on('window-all-closed', () => app.quit());
