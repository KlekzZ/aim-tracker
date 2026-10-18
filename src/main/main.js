// Electron main process: opens the window, scans and watches the stats
// folder, and answers the page's requests.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const db = require('../core/db');
const { importFolder, backfillDetails } = require('../core/importer');
const {
  buildData, config, planCodesTodayFirst, setFollowStart, markFollowDone,
  acceptProposal, rejectProposal, undismissProposal, clearProgram,
} = require('./data-service');
const kovaaks = require('./kovaaks');
const { loadSettings, saveSettings } = require('./app-settings');
const updater = require('./updater');
const { codeVersion } = require('./version');
const ollama = require('./ollama');
const knowledge = require('./knowledge');
const coach = require('./coach');

let window = null;
let database = null;
let settings = null;
let watcher = null;
let lastScan = { at: null, summary: null, error: null };
let updateStatus = { text: '', canInstall: false };
let playlistStatus = { text: '', error: false };
let ollamaStatus = { checking: true, installed: false, running: false, models: [], embedReady: false, chatReady: false };
let embedStatus = { text: '', busy: false };
let pullStatus = { model: null, text: '', percent: null, error: null };

function notifyPage(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

async function scan() {
  try {
    const summary = await importFolder(database, settings.statsDir);
    await backfillDetails(database, settings.statsDir); // older runs, once
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

// Checks whether Ollama is running and which models it has, so the page can
// tell the user exactly what's missing instead of just "it doesn't work".
async function refreshOllamaStatus() {
  const running = await ollama.isRunning();
  const models = running ? await ollama.listModels().catch(() => []) : [];
  const next = {
    checking: false,
    installed: Boolean(ollama.findInstallation()),
    running,
    models,
    embedReady: ollama.hasModel(models, settings.coachEmbedModel),
    chatReady: ollama.hasModel(models, settings.coachChatModel),
  };
  // This runs on a timer. Only redraw the page when something actually
  // changed, otherwise a redraw lands in the middle of the user typing.
  const changed = JSON.stringify(next) !== JSON.stringify(ollamaStatus);
  ollamaStatus = next;
  if (changed) notifyPage('data-changed');
  return ollamaStatus;
}

// Embeds any knowledge chunks that don't have a vector yet. Safe to call
// often: it does nothing if Ollama isn't running or nothing is pending.
async function embedPending() {
  if (!ollamaStatus.running || !ollamaStatus.embedReady) return;
  const pending = db.countChunksNeedingEmbedding(database, settings.coachEmbedModel);
  if (pending === 0) return;
  embedStatus = { text: `Indekserer kilder: 0 af ${pending}...`, busy: true };
  notifyPage('data-changed');
  try {
    await knowledge.embedPendingChunks(database, settings.coachEmbedModel, (done, total) => {
      embedStatus = { text: `Indekserer kilder: ${done} af ${total}...`, busy: true };
      notifyPage('data-changed');
    });
    embedStatus = { text: '', busy: false };
  } catch (err) {
    embedStatus = { text: `Indeksering fejlede: ${err.message}`, busy: false };
  }
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
      appVersion: codeVersion,
      lastScan,
      updateStatus,
      playlistStatus,
      ollamaStatus,
      embedStatus,
      pullStatus,
      coachConfig: { embedModel: settings.coachEmbedModel, chatModel: settings.coachChatModel },
      knowledgeSources: db.allKnowledgeSources(database),
      coachMessages: db.coachMessages(database),
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

  // Katalog: search kovaaks.com for playlists or scenarios. The last 30
  // searches are cached, so they still work offline.
  ipcMain.handle('catalog-search', async (_event, kind, query) => {
    const type = kind === 'scenarios' ? 'scenarios' : 'playlists';
    const key = `${type}:${String(query || '').trim().toLowerCase()}`;
    const cache = db.getState(database, 'catalogCache') || {};
    try {
      const results = type === 'scenarios' ? await kovaaks.searchScenarios(query) : await kovaaks.searchPlaylists(query);
      cache[key] = { at: new Date().toISOString(), results };
      const keep = Object.entries(cache).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 30);
      db.setState(database, 'catalogCache', Object.fromEntries(keep));
      return { results, cachedAt: null };
    } catch (err) {
      if (cache[key]) return { results: cache[key].results, cachedAt: cache[key].at };
      return { results: [], error: err.message };
    }
  });

  // ---------- Programme suggestions on the home screen ----------

  ipcMain.handle('accept-proposal', () => {
    // Rebuild the suggestion here instead of trusting what the page sends,
    // so the programme that gets saved is always one this code generated.
    const data = buildData(database, {}, { followPlan: settings.followPlan });
    const proposal = data.proposal;
    if (proposal.status !== 'ready') return false;
    // A finished programme's result goes into the history before the new one starts.
    acceptProposal(database, proposal.program, data.activeProgram ? proposal.lastReport : null);
    settings.followPlan = true; // a programme is only useful if you follow it
    saveSettings(settings);
    notifyPage('data-changed');
    return true;
  });

  ipcMain.handle('reject-proposal', (_event, kind) => {
    rejectProposal(database, kind === 'general' ? 'general' : 'weakness');
    notifyPage('data-changed');
  });

  ipcMain.handle('undismiss-proposal', () => {
    undismissProposal(database);
    notifyPage('data-changed');
  });

  ipcMain.handle('clear-program', () => {
    const data = buildData(database, {}, { followPlan: settings.followPlan });
    clearProgram(database, data.activeProgram ? (data.proposal.report || data.proposal.lastReport) : null);
    notifyPage('data-changed');
  });

  // What the last programme did, in one line for the model.
  function lastProgramLine(report) {
    if (!report) return '';
    const changes = report.subcategories.filter((s) => s.focus)
      .map((s) => `${s.subcategory} ${s.change >= 0 ? '+' : ''}${Math.round(s.change * 100)} point`).join(', ');
    return `Mit sidste program var "${report.programName}", og det gav: ${changes || 'ingen målbar ændring'}. `;
  }

  // Asks the local model why this programme makes sense, using your sources.
  ipcMain.handle('explain-proposal', async () => {
    const data = buildData(database, {}, { followPlan: settings.followPlan });
    if (data.proposal.status !== 'ready') return;
    const p = data.proposal.program;
    const weak = p.profile.map((row) => `${row.subcategory} (${Math.round(row.percent * 100)} % af Platinum)`).join(', ');
    const question = `Jeg har fået foreslået dette træningsprogram: "${p.name}". `
      + `Mine svageste underkategorier er: ${weak}. `
      + lastProgramLine(data.proposal.lastReport)
      + 'Forklar kort (højst 4 sætninger), hvorfor det giver mening at træne netop det, og hvad jeg skal holde øje med undervejs.';

    db.setState(database, 'proposalRationale', { id: p.id, text: 'Spørger Coach...' });
    notifyPage('data-changed');
    try {
      const { answer } = await coach.ask(database, question, {
        embedModel: settings.coachEmbedModel, chatModel: settings.coachChatModel,
        includeStats: true, data, onToken: () => {},
      });
      db.setState(database, 'proposalRationale', { id: p.id, text: answer });
    } catch (err) {
      db.setState(database, 'proposalRationale', { id: p.id, text: `Kunne ikke spørge Coach: ${err.message}` });
    }
    notifyPage('data-changed');
  });
  ipcMain.handle('install-update', () => updater.installNow());

  // ---------- AI coach: local knowledge base and chat (Ollama, 127.0.0.1 only) ----------

  ipcMain.handle('check-ollama', () => refreshOllamaStatus().then(() => embedPending()));

  // Starts the installed Ollama app, the same as double-clicking its icon.
  ipcMain.handle('start-ollama', async () => {
    const exe = ollama.findInstallation();
    if (!exe) return false;
    await shell.openPath(exe);
    // Give the server a few seconds to come up, then look again.
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await refreshOllamaStatus();
    return ollamaStatus.running;
  });

  // Downloads a model through the local Ollama server. Only the two models
  // the app is configured to use, so the page can't ask for anything else.
  ipcMain.handle('pull-model', async (_event, model) => {
    const allowed = [settings.coachEmbedModel, settings.coachChatModel];
    if (!allowed.includes(model)) return;
    pullStatus = { model, text: 'Starter download...', percent: null, error: null };
    notifyPage('data-changed');
    try {
      await ollama.pullModel(model, (progress) => {
        pullStatus = { model, text: progress.status, percent: progress.percent, error: null };
        notifyPage('data-changed');
      });
      pullStatus = { model: null, text: '', percent: null, error: null };
      await refreshOllamaStatus();
      await embedPending();
    } catch (err) {
      pullStatus = { model: null, text: '', percent: null, error: `Download fejlede: ${err.message}` };
      notifyPage('data-changed');
    }
  });

  ipcMain.handle('add-knowledge-source', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Tilføj kilde',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Tekst', extensions: ['md', 'txt'] }],
    });
    if (result.canceled || !result.filePaths.length) return { added: 0, problems: [] };

    let added = 0;
    const problems = [];
    for (const filePath of result.filePaths) {
      try {
        const text = fs.readFileSync(filePath, 'utf8');
        const title = path.basename(filePath).replace(/\.(md|txt)$/i, '');
        const outcome = knowledge.importSource(database, { title, kind: path.extname(filePath).slice(1) || 'text', fileName: path.basename(filePath), text });
        if (outcome.added) added++;
        else problems.push(`${path.basename(filePath)}: ${outcome.reason}`);
      } catch (err) {
        problems.push(`${path.basename(filePath)}: ${err.message}`);
      }
    }
    notifyPage('data-changed');
    embedPending(); // runs in the background; the page updates as chunks finish
    return { added, problems };
  });

  ipcMain.handle('remove-knowledge-source', (_event, id) => {
    db.removeKnowledgeSource(database, id);
    notifyPage('data-changed');
  });

  ipcMain.handle('ask-coach', async (_event, question, includeStats) => {
    db.addCoachMessage(database, { role: 'user', content: question });
    notifyPage('data-changed');
    try {
      const data = buildData(database, {}, { followPlan: settings.followPlan });
      const { answer, citations } = await coach.ask(database, question, {
        embedModel: settings.coachEmbedModel,
        chatModel: settings.coachChatModel,
        includeStats,
        data,
        onToken: (piece) => notifyPage('coach-token', piece),
      });
      db.addCoachMessage(database, { role: 'assistant', content: answer, citations });
    } catch (err) {
      db.addCoachMessage(database, { role: 'error', content: err.message });
    }
    notifyPage('data-changed');
  });

  ipcMain.handle('clear-coach-chat', () => {
    db.clearCoachMessages(database);
    notifyPage('data-changed');
  });

  // Citations can link to a source video. Only ever open plain https links.
  ipcMain.handle('open-external-link', (_event, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  settings = loadSettings({
    statsDir: config.default_stats_dir_windows, autoUpdate: true, followPlan: false,
    // Defaults picked for a 16 GB VRAM card. Changeable later without losing
    // existing embeddings of the model that matches embedding_model per chunk.
    coachEmbedModel: 'nomic-embed-text', coachChatModel: 'qwen2.5:14b',
  });
  // The database file lives in %APPDATA%\Aim Tracker, not in the KovaaK's folder.
  database = db.openDatabase(path.join(app.getPath('userData'), 'aim-tracker.sqlite'));

  registerIpc();
  createWindow();
  await scan();
  watchStatsFolder();
  startUpdater();
  cachePlaylists(false); // runs in the background; the page updates when done

  refreshOllamaStatus().then(() => embedPending());
  setInterval(() => refreshOllamaStatus().then(() => embedPending()), 60000); // in case Ollama is started later
});

app.on('window-all-closed', () => app.quit());
