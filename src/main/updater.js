// Auto-update from GitHub Releases (github.com/KlekzZ/aim-tracker).
// This is the ONLY network access in the app (approved by the owner). It only
// asks GitHub "is there a newer version?" and downloads it. No user data is sent.
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

const SIX_HOURS = 6 * 60 * 60 * 1000;
let timer = null;
let listenersAdded = false;

// sendStatus(text, canInstall) shows the status on the Settings page.
function startUpdater(enabled, sendStatus) {
  clearInterval(timer);

  if (!app.isPackaged) {
    sendStatus('Opdatering virker kun i den installerede app (ikke med npm start).', false);
    return;
  }
  if (!enabled) {
    sendStatus('Automatisk opdatering er slået fra.', false);
    return;
  }

  if (!listenersAdded) {
    listenersAdded = true;
    autoUpdater.autoDownload = true;
    autoUpdater.on('checking-for-update', () => sendStatus('Søger efter opdatering...', false));
    autoUpdater.on('update-not-available', () => sendStatus(`Du har den nyeste version (${app.getVersion()}).`, false));
    autoUpdater.on('update-available', (info) => sendStatus(`Ny version ${info.version} fundet, henter...`, false));
    autoUpdater.on('download-progress', (p) => sendStatus(`Henter opdatering: ${Math.round(p.percent)} %`, false));
    autoUpdater.on('update-downloaded', (info) =>
      sendStatus(`Version ${info.version} er klar. Genstart for at installere.`, true));
    autoUpdater.on('error', (err) => sendStatus(`Kunne ikke søge efter opdatering: ${err.message}`, false));
  }

  checkNow();
  timer = setInterval(checkNow, SIX_HOURS);
}

function checkNow() {
  // Errors are already shown by the 'error' listener above.
  autoUpdater.checkForUpdates().catch(() => {});
}

function installNow() {
  autoUpdater.quitAndInstall();
}

module.exports = { startUpdater, checkNow, installNow };
