// "Sessioner": runs grouped into sessions, plus the post-session logs.

function renderSessions(data) {
  const sessions = data.sessions.map((s) => `
    <div class="session">
      <div class="when"><b>${esc(s.start.slice(8, 10))}.${esc(s.start.slice(5, 7))}</b><span>${timeOnly(s.start)} til ${timeOnly(s.end)}</span></div>
      <div>
        <span class="pill">${s.runCount} runs</span> <span class="pill">${s.minutes} min</span>
        <div class="chips">
          ${s.scenarios.map((sc) => `<span class="pill">${esc(sc.scenario)} · ${sc.runs}× · bedst ${num(sc.best, 1)}</span>`).join('')}
        </div>
      </div>
    </div>`).join('');

  const logs = data.sessionLogs.length
    ? `<table>
        <tr><th>Tid</th><th>Fokus-cue</th><th class="num">Spænding</th><th class="num">Smerte</th></tr>
        ${data.sessionLogs.map((l) => `
          <tr title="${esc(l.note)}">
            <td>${esc(new Date(l.created_at).toLocaleString('da-DK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td>
            <td>${esc(l.focus_cue) || '<span class="muted">-</span>'}${l.note ? `<div class="muted small">${esc(l.note)}</div>` : ''}</td>
            <td class="num">${l.tension}/5</td>
            <td class="num">${l.pain >= 5 ? `<span class="pill warning">${icon('alert')}${l.pain}</span>` : l.pain}</td>
          </tr>`).join('')}
      </table>`
    : '<div class="empty">Ingen logs endnu. Udfyld formularen på "I dag" efter en session.</div>';

  document.getElementById('page-sessions').innerHTML = `
    ${pageHead('Sessioner', `En ny session starter efter ${data.sessionGapMinutes} minutters pause. Tiden er fra første til sidste run.`)}
    <div class="cols cols-2">
      <div class="card"><h2>Sessioner</h2>${sessions || '<div class="empty">Ingen runs endnu.</div>'}</div>
      <div class="card"><h2>Dine logs</h2>${logs}</div>
    </div>`;
}
