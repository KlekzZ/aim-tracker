// "Log": every run with its settings, plus files that could not be read.

let onlyWarnings = false;

// FOVScale names are long, so the compact settings line shortens the common ones.
const FOV_SHORT = { Overwatch: 'OW', CSGO: 'CS' };

function settingsLine(r) {
  const part = (key, text) => `<span class="${r.changed.includes(key) ? 'changed' : ''}">${text}</span>`;
  return [
    part('sensScale', esc(r.sensScale)),
    part('sens', num(r.sens, 2)),
    part('dpi', `${num(r.dpi)} DPI`),
    part('fov', `FOV ${num(r.fov, 0)}`) + ' ' + part('fovScale', esc(FOV_SHORT[r.fovScale] || r.fovScale)),
    part('resolution', esc(r.resolution)),
  ].join(' <span class="muted">·</span> ');
}

function renderLog(data) {
  const runs = onlyWarnings ? data.runs.filter((r) => r.warnings.length) : data.runs;

  const problems = data.problems.length
    ? `<div class="alert warning">${icon('alert')}<div><b>${data.problems.length} fil(er) kunne ikke læses</b>
        <ul>${data.problems.map((p) => `<li>${esc(p.file_name)}: ${esc(p.reason)}</li>`).join('')}</ul></div></div>`
    : '';

  const rows = runs.map((r) => `
    <tr>
      <td>${dateTime(r.playedAt)}</td>
      <td class="name-cell"><b>${esc(r.scenario)}</b>${r.mode.toLowerCase() !== 'challenge' ? `<small>${esc(r.mode)}</small>` : ''}</td>
      <td class="num">${num(r.score, 1)}</td>
      <td class="num">${pct(r.accuracy)}</td>
      <td class="small">${settingsLine(r)}${r.changed.length ? ' <span class="pill warning">ændret</span>' : ''}</td>
      <td class="num">${r.horizontalFov === null ? '?' : num(r.horizontalFov, 1) + '°'}</td>
      <td>${r.warnings.length
        ? `<details><summary><span class="pill warning">${icon('alert')}${r.warnings.length}</span></summary><ul class="small secondary">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>`
        : `<span class="pill good">${icon('check')}OK</span>`}</td>
    </tr>`).join('');

  const filter = `<label class="toggle"><input type="checkbox" id="only-warnings" ${onlyWarnings ? 'checked' : ''}>Kun runs med advarsler</label>`;

  const page = document.getElementById('page-log');
  page.innerHTML = `
    ${pageHead('Log', `${data.runs.length} runs. Gul tekst = indstillingen ændrede sig siden runnet før.`, filter)}
    <div class="stack">
      ${problems}
      <div class="card table-wrap">
        ${runs.length ? `<table>
          <tr><th>Tid</th><th>Scenarie</th><th class="num">Score</th><th class="num">Acc.</th><th>Indstillinger</th><th class="num">H-FOV</th><th>Status</th></tr>
          ${rows}
        </table>` : '<div class="empty">Ingen runs at vise.</div>'}
      </div>
    </div>`;

  document.getElementById('only-warnings').addEventListener('change', (e) => {
    onlyWarnings = e.target.checked;
    renderLog(data);
  });
}
