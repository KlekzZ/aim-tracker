// Electron main process: opens the window, scans and watches the stats
// folder, and answers the page's requests.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const db = require('../core/db');
const { importFolder } = require('../core/importer');
const { buildData, config, planCodesTodayFirst, setFollowStart, markFollowDone } = require('./data-service');
const kovaaks = require('./kovaaks');
const { loadSettings, saveSettings } = require('./app-settings');
const updater = require('./updater');

let window = null;
let database = null;
let settings = null;
let watcher = null;
let lastScan = { at: null, summary: null, error: null };
let updateStatus = { text: '', canInstall: false };
let playlistStatus = { text: '', error: false };

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

// Looks up playlists on kovaaks.com and saves them. Only the codes we don't
// have yet, unless force is true (the "Opdater playlister" button).
async function cachePlaylists(force) {
  const cached = db.allPlaylists(database);
  const codes = planCodesTodayFirst().filter((code) => force || !cached[code]);
  if (codes.length === 0) return;
  playlistStatus = { text: `Henter ${codes.length} playlist(er) fra kovaaks.com...`, error: false };
  notifyPage('data-changed');

  // kovaaks.com takes a few seconds per lookup and times out if we ask for
  // many at once. So two "workers" take codes from the queue one by one,
  // and the page updates as soon as each playlist arrives.
  const queue = [...codes];
  const failed = [];
  const worker = async () => {
    while (queue.length) {
      const code = queue.shift();
      try {
        db.savePlaylist(database, await kovaaks.fetchPlaylist(code));
        notifyPage('data-changed');
      } catch (err) {
        failed.push(`${code} (${err.message})`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  playlistStatus = failed.length
    ? { text: `Kunne ikke hente: ${failed.join(', ')}`, error: true }
    : { text: `Hentet ${codes.length} playlist(er) fra kovaaks.com.`, error: false };
  notifyPage('data-changed');
}

function startUpdater() {
  updater.startUpdater(settings.autoUpdate, (text, canInstall) => {
    updateStatus = { text, canInstall };
    notifyPage('update-status', updateStatus);
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'Aim Tracker',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    backgroundColor: '#0e0f13', // same as the page, so there's no white flash on start
    // Hide the normal Windows title bar but keep its buttons, in dark colors.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e0f13', symbolColor: '#a9adb7', height: 38 },
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
      playlistStatus,
    }, { followPlan: settings.followPlan })
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
  ipcMain.handle('refresh-playlists', () => cachePlaylists(true));

  // "Følg planen": the toggle, where to start, and the escape hatch.
  ipcMain.handle('set-follow-plan', (_event, enabled) => {
    settings.followPlan = Boolean(enabled);
    saveSettings(settings);
    notifyPage('data-changed');
  });
  ipcMain.handle('follow-start', (_event, index) => {
    setFollowStart(database, Math.max(0, Math.floor(Number(index) || 0)));
    notifyPage('data-changed');
  });
  ipcMain.handle('follow-mark-done', () => {
    markFollowDone(database);
    notifyPage('data-changed');
  });
  ipcMain.handle('open-in-kovaaks', (_event, target) => kovaaks.openInKovaaks(target || {}));
  ipcMain.handle('install-update', () => updater.installNow());
}

app.whenReady().then(async () => {
  settings = loadSettings({ statsDir: config.default_stats_dir_windows, autoUpdate: true, followPlan: false });
  // The database file lives in %APPDATA%\Aim Tracker, not in the KovaaK's folder.
  database = db.openDatabase(path.join(app.getPath('userData'), 'aim-tracker.sqlite'));

  registerIpc();
  createWindow();
  await scan();
  watchStatsFolder();
  startUpdater();
  cachePlaylists(false); // runs in the background; the page updates when done
});

app.on('window-all-closed', () => app.quit());
