// Rules for "code-only" updates.
//
// Why: Windows Smart App Control blocks new, unsigned installers, so normal
// updates (a new .exe) can't run. Instead we only download the app's code
// (one file, app.asar) from GitHub. The .exe that Windows already trusts
// stays the same and simply loads the newer code.
//
// Each GitHub release has an "app-update.json" next to the code file:
//   { "version": "0.5.0", "file": "app-0.5.0.asar", "sha512": "<hex>", "electron": "44.9.0" }
// Pure functions only, so they can be tested.

// "0.10.0" is newer than "0.9.3". Returns true if a is newer than b.
function isNewer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const FILE = /^app-\d+\.\d+\.\d+\.asar$/;
const SHA512_HEX = /^[0-9a-f]{128}$/;

// Checks the manifest from GitHub before we trust it. Returns a reason (Danish)
// if it can't be used, or null if it's fine.
function manifestProblem(manifest, runningElectron) {
  if (!manifest || !VERSION.test(manifest.version) || !FILE.test(manifest.file) || !SHA512_HEX.test(manifest.sha512)) {
    return 'Opdateringsfilen på GitHub ser forkert ud.';
  }
  // New code is only safe on the same Electron major version it was built for.
  const builtFor = String(manifest.electron || '').split('.')[0];
  const running = String(runningElectron).split('.')[0];
  if (builtFor !== running) {
    return `Version ${manifest.version} kræver en ny installer (Electron ${builtFor}, du har ${running}). Hent den fra GitHub.`;
  }
  return null;
}

module.exports = { isNewer, manifestProblem };
