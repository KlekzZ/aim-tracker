// "Log": every run with its sens and cm/360, plus files that could not be read.

let onlyChallenge = false;

function renderLog(data) {
  const runs = onlyChallenge ? data.runs.filter((r) => r.mode.toLowerCase() === 'challenge') : data.runs;

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
      <td class="${r.sensChanged ? 'changed' : ''}">${esc(r.sensScale)} ${num(r.sens, 2)} <span class="muted">·</span> ${num(r.dpi)} DPI</td>
      <td class="num ${r.sensChanged ? 'changed' : ''}">${r.cm360 === null ? '?' : `${num(r.cm360, 1)} cm`}${r.sensChanged ? ' <span class="pill warning">ny sens</span>' : ''}</td>
    </tr>`).join('');

  const filter = `<label class="toggle"><input type="checkbox" id="only-challenge" ${onlyChallenge ? 'checked' : ''}>Kun Challenge-runs</label>`;

  const page = document.getElementById('page-log');
  page.innerHTML = `
    ${pageHead('Log', `${data.runs.length} runs. Gul = du skiftede sens siden runnet før.`, filter)}
    <div class="stack">
      ${problems}
      <div class="card table-wrap">
        ${runs.length ? `<table>
          <tr><th>Tid</th><th>Scenarie</th><th class="num">Score</th><th class="num">Acc.</th><th>Sens</th><th class="num">cm/360</th></tr>
          ${rows}
        </table>` : '<div class="empty">Ingen runs at vise.</div>'}
      </div>
    </div>`;

  document.getElementById('only-challenge').addEventListener('change', (e) => {
    onlyChallenge = e.target.checked;
    renderLog(data);
  });
}
