// "Indstillinger": stats folder, scanning and auto-update.

function renderSettings(data) {
  const scan = data.lastScan;
  const scanText = scan.error
    ? `<div class="alert critical">${icon('alert')}<div>${esc(scan.error)}</div></div>`
    : scan.summary
      ? `<p class="secondary small">Sidste scan kl. ${esc(new Date(scan.at).toLocaleTimeString('da-DK'))}:
         ${scan.summary.files} filer, ${scan.summary.added} nye runs, ${scan.summary.problems} problemer.</p>`
      : '';

  const e = data.expectedSettings;
  document.getElementById('page-settings').innerHTML = `
    ${pageHead('Indstillinger', '')}
    <div class="cols cols-2">
      <div class="stack">
        <div class="card">
          <h2>KovaaK's stats-mappe</h2>
          <div class="code-card"><code>${esc(data.statsDir)}</code></div>
          <p class="muted small">Appen læser kun filerne. Den skriver, flytter eller sletter aldrig noget i mappen,
            og den rører ikke spillet. Nye runs bliver fundet automatisk, mens appen kører.</p>
          <button class="btn" id="choose-dir">${icon('folder', 16)}Vælg mappe</button>
          <button class="btn ghost" id="rescan">${icon('refresh', 16)}Scan igen</button>
          ${scanText}
        </div>
        <div class="card">
          <h2>Indstillinger fra planen</h2>
          <div class="kpis">
            <div class="kpi"><span>Sens</span><b>${num(e.sens, 2)} ${esc(e.sens_scale)}</b></div>
            <div class="kpi"><span>DPI</span><b>${e.dpi}</b></div>
            <div class="kpi"><span>FOV</span><b>${e.fov} ${esc(e.fov_scale)}</b></div>
            <div class="kpi"><span>Opløsning</span><b>${esc(e.aspect_ratio)}</b></div>
          </div>
          <p class="muted small">Benchmarks kræver mindst ${e.min_horizontal_fov_for_benchmarks}° horisontal FOV. Ændres i data/config.json.</p>
        </div>
      </div>
      <div class="card">
        <h2>Opdatering</h2>
        <p>Version <b>${esc(data.appVersion)}</b></p>
        <label class="toggle"><input type="checkbox" id="auto-update" ${data.autoUpdate ? 'checked' : ''}>
          Søg automatisk efter nye versioner på GitHub</label>
        <p class="muted small">Det er det eneste, appen bruger internettet til. Der sendes ingen data.</p>
        <p id="update-status" class="secondary">${esc(data.updateStatus.text)}</p>
        <button class="btn ghost" id="check-update">${icon('refresh', 16)}Søg nu</button>
        <button class="btn" id="install-update" ${data.updateStatus.canInstall ? '' : 'hidden'}>${icon('download', 16)}Genstart og opdater</button>
      </div>
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
