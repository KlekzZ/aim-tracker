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
  setFollowPlan: (enabled) => ipcRenderer.invoke('set-follow-plan', enabled),
  followStart: (index) => ipcRenderer.invoke('follow-start', index),
  followMarkDone: () => ipcRenderer.invoke('follow-mark-done'),
  // target: { type: 'playlist', code } or { type: 'scenario', name }
  openInKovaaks: (target) => ipcRenderer.invoke('open-in-kovaaks', target),
  onDataChanged: (callback) => ipcRenderer.on('data-changed', () => callback()),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status)),

  // AI coach: local knowledge base and chat (Ollama on 127.0.0.1 only).
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  startOllama: () => ipcRenderer.invoke('start-ollama'),
  pullModel: (model) => ipcRenderer.invoke('pull-model', model),
  addKnowledgeSource: () => ipcRenderer.invoke('add-knowledge-source'),
  removeKnowledgeSource: (id) => ipcRenderer.invoke('remove-knowledge-source', id),
  askCoach: (question, includeStats) => ipcRenderer.invoke('ask-coach', question, includeStats),
  clearCoachChat: () => ipcRenderer.invoke('clear-coach-chat'),
  onCoachToken: (callback) => ipcRenderer.on('coach-token', (_event, piece) => callback(piece)),
  openExternal: (url) => ipcRenderer.invoke('open-external-link', url),
});
