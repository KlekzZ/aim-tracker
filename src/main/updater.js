// Code-only updates from GitHub Releases (github.com/KlekzZ/aim-tracker).
//
// Windows Smart App Control blocks new unsigned installers, so instead of a
// new .exe we download only the app code (app-x.y.z.asar), check its SHA-512
// checksum, and load it on the next start (see bootstrap.js).
//
// Network: only GitHub (approved by the owner). No user data is sent.
const path = require('node:path');
const crypto = require('node:crypto');
// "original-fs" is Node's normal fs. Electron's fs treats .asar files as
// folders, which would get in the way when we save one as a plain file.
const fs = require('original-fs');
const { app, net } = require('electron');
const { isNewer, manifestProblem } = require('../core/code-update');
const { codeVersion } = require('./version');

const RELEASES_API = 'https://api.github.com/repos/KlekzZ/aim-tracker/releases/latest';
const SIX_HOURS = 6 * 60 * 60 * 1000;
let timer = null;
let sendStatus = () => {};

const updatesDir = () => path.join(app.getPath('userData'), 'code-updates');

async function getJson(url) {
  const response = await net.fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'aim-tracker' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`GitHub svarede ${response.status}`);
  return response.json();
}

async function checkNow() {
  try {
    sendStatus('Søger efter opdatering...', false);
    const release = await getJson(RELEASES_API);
    const asset = (name) => (release.assets || []).find((a) => a.name === name);
    const manifestAsset = asset('app-update.json');
    if (!manifestAsset) {
      sendStatus(`Du har den nyeste version (${codeVersion}).`, false);
      return;
    }

    const manifest = await getJson(manifestAsset.browser_download_url);
    if (!isNewer(manifest.version, codeVersion)) {
      sendStatus(`Du har den nyeste version (${codeVersion}).`, false);
      return;
    }
    const problem = manifestProblem(manifest, process.versions.electron);
    if (problem) {
      sendStatus(problem, false);
      return;
    }
    const codeAsset = asset(manifest.file);
    if (!codeAsset) throw new Error(`${manifest.file} mangler på GitHub`);

    sendStatus(`Ny version ${manifest.version} fundet, henter...`, false);
    await download(codeAsset.browser_download_url, manifest);
    sendStatus(`Version ${manifest.version} er klar. Genstart for at bruge den.`, true);
  } catch (err) {
    sendStatus(`Kunne ikke søge efter opdatering: ${err.message}`, false);
  }
}

async function download(url, manifest) {
  const response = await net.fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`download fejlede (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());

  // Only use the file if it is exactly the one GitHub Actions built.
  const hash = crypto.createHash('sha512').update(data).digest('hex');
  if (hash !== manifest.sha512) throw new Error('filen matcher ikke checksummen, så den bruges ikke');

  const dir = updatesDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, manifest.file), data);
  // current.json tells bootstrap.js which code to start next time.
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ version: manifest.version, file: manifest.file }));

  // Remove older downloads so they don't pile up.
  for (const name of fs.readdirSync(dir)) {
    if (/^app-.*\.asar$/.test(name) && name !== manifest.file) fs.rmSync(path.join(dir, name), { force: true });
  }
}

// sendStatusFn(text, canInstall) shows the status in the app.
function startUpdater(enabled, sendStatusFn) {
  sendStatus = sendStatusFn;
  clearInterval(timer);
  if (!app.isPackaged) {
    sendStatus('Opdatering virker kun i den installerede app (ikke med npm start).', false);
    return;
  }
  if (!enabled) {
    sendStatus('Automatisk opdatering er slået fra.', false);
    return;
  }
  checkNow();
  timer = setInterval(checkNow, SIX_HOURS);
}

// Restart the app; bootstrap.js then loads the new code.
function installNow() {
  app.relaunch();
  app.exit(0);
}

module.exports = { startUpdater, checkNow, installNow };
