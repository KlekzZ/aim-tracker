// The bridge between the page and the main process. The page has no Node
// access at all; it can only call the functions listed here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('get-data'),
  rescan: () => ipcRenderer.invoke('rescan'),
  saveSessionLog: (entry) => ipcRenderer.invoke('save-session-log', entry),
  chooseStatsDir: () => ipcRenderer.invoke('choose-stats-dir'),
  setAutoUpdate: (enabled) => ipcRenderer.invoke('set-auto-update', enabled),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  refreshPlaylists: () => ipcRenderer.invoke('refresh-playlists'),
  // target: { type: 'playlist', code } or { type: 'scenario', name }
  openInKovaaks: (target) => ipcRenderer.invoke('open-in-kovaaks', target),
  onDataChanged: (callback) => ipcRenderer.on('data-changed', () => callback()),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status)),
});
