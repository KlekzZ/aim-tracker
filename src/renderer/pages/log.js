// "Log": every run with its settings, plus files that could not be read.
// A yellow frame on a setting means it changed since the run before.

const SETTING_COLUMNS = [
  ['sensScale', 'Sens-skala', (r) => esc(r.sensScale)],
  ['sens', 'Sens', (r) => num(r.sens, 2)],
  ['dpi', 'DPI', (r) => num(r.dpi)],
  ['fov', 'FOV', (r) => num(r.fov, 1)],
  ['fovScale', 'FOVScale', (r) => esc(r.fovScale)],
  ['resolution', 'Opløsning', (r) => esc(r.resolution)],
];

function renderLog(data) {
  const problems = data.problems.length
    ? `<div class="alert warning"><strong>⚠ ${data.problems.length} fil(er) kunne ikke læses</strong>
        <ul>${data.problems.map((p) => `<li>${esc(p.file_name)}: ${esc(p.reason)}</li>`).join('')}</ul></div>`
    : '';

  const rows = data.runs.map((r) => `
    <tr>
      <td>${dateTime(r.playedAt)}</td>
      <td>${esc(r.scenario)}</td>
      <td>${esc(r.mode)}</td>
      <td class="num">${num(r.score, 1)}</td>
      <td class="num">${pct(r.accuracy)}</td>
      ${SETTING_COLUMNS.map(([key, , show]) => `<td class="${r.changed.includes(key) ? 'changed' : ''}">${show(r)}</td>`).join('')}
      <td class="num">${r.horizontalFov === null ? '?' : num(r.horizontalFov, 1) + '°'}</td>
      <td>${r.warnings.length ? '⚠ ' + r.warnings.map(esc).join('<br>⚠ ') : '✓'}</td>
    </tr>`).join('');

  document.getElementById('page-log').innerHTML = `
    ${problems}
    <div class="card">
      <h2>Alle runs (${data.runs.length})</h2>
      <p class="muted">Gul ramme = indstillingen ændrede sig siden runnet før.</p>
      <div class="table-wrap"><table>
        <tr><th>Tid</th><th>Scenarie</th><th>Type</th><th class="num">Score</th><th class="num">Accuracy</th>
          ${SETTING_COLUMNS.map(([, label]) => `<th>${label}</th>`).join('')}
          <th class="num">Horisontal FOV</th><th>Advarsler</th></tr>
        ${rows}
      </table></div>
    </div>`;
}
