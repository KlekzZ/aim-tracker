// "Indstillinger": stats folder, scanning and auto-update.

function renderSettings(data) {
  const scan = data.lastScan;
  const scanText = scan.error
    ? `<div class="alert critical"><strong>⚠ ${esc(scan.error)}</strong></div>`
    : scan.summary
      ? `<p class="secondary">Sidste scan ${esc(new Date(scan.at).toLocaleTimeString('da-DK'))}:
         ${scan.summary.files} filer, ${scan.summary.added} nye runs, ${scan.summary.problems} problemer.</p>`
      : '';

  const e = data.expectedSettings;
  document.getElementById('page-settings').innerHTML = `
    <div class="card">
      <h2>KovaaK's stats-mappe</h2>
      <p><code>${esc(data.statsDir)}</code></p>
      <p class="muted">Appen læser kun filerne. Den skriver, flytter eller sletter aldrig noget i mappen,
        og den rører ikke spillet. Nye filer bliver fundet automatisk, mens appen kører.</p>
      <button class="action" id="choose-dir">Vælg mappe</button>
      <button class="action secondary-btn" id="rescan">Scan igen</button>
      ${scanText}
    </div>
    <div class="card">
      <h2>Indstillinger fra planen</h2>
      <p>Sens-skala ${esc(e.sens_scale)}, sens ${num(e.sens, 2)}, ${e.dpi} DPI, FOV ${e.fov} ${esc(e.fov_scale)},
        opløsning ${esc(e.aspect_ratio)}, mindst ${e.min_horizontal_fov_for_benchmarks}° horisontal FOV.</p>
      <p class="muted">Ændres i data/config.json.</p>
    </div>
    <div class="card">
      <h2>Opdatering</h2>
      <p>Version ${esc(data.appVersion)}</p>
      <label><input type="checkbox" id="auto-update" ${data.autoUpdate ? 'checked' : ''}>
        Søg automatisk efter nye versioner på GitHub (det eneste appen bruger internettet til)</label>
      <p id="update-status" class="secondary">${esc(data.updateStatus.text)}</p>
      <button class="action secondary-btn" id="check-update">Søg nu</button>
      <button class="action" id="install-update" ${data.updateStatus.canInstall ? '' : 'hidden'}>Genstart og opdater</button>
    </div>`;

  document.getElementById('choose-dir').addEventListener('click', () => window.api.chooseStatsDir());
  document.getElementById('rescan').addEventListener('click', () => window.api.rescan());
  document.getElementById('auto-update').addEventListener('change', (ev) => window.api.setAutoUpdate(ev.target.checked));
  document.getElementById('check-update').addEventListener('click', () => window.api.checkForUpdate());
  document.getElementById('install-update').addEventListener('click', () => window.api.installUpdate());
}

// Called when the updater sends news, without redrawing the whole page.
function showUpdateStatus(status) {
  const text = document.getElementById('update-status');
  const button = document.getElementById('install-update');
  if (text) text.textContent = status.text;
  if (button) button.hidden = !status.canInstall;
}
