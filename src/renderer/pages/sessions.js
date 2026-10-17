// "Sessioner": runs grouped into sessions, plus the post-session logs.

function renderSessions(data) {
  const sessions = data.sessions.map((s) => `
    <div class="card">
      <h3>${dateTime(s.start)} til ${dateTime(s.end).slice(11)}
        <span class="pill">${s.runCount} runs</span> <span class="pill">${s.minutes} min</span></h3>
      <table>
        <tr><th>Scenarie</th><th class="num">Runs</th><th class="num">Bedst</th></tr>
        ${s.scenarios.map((sc) => `<tr><td>${esc(sc.scenario)}</td><td class="num">${sc.runs}</td><td class="num">${num(sc.best, 1)}</td></tr>`).join('')}
      </table>
    </div>`).join('');

  const logs = data.sessionLogs.length
    ? `<table>
        <tr><th>Tidspunkt</th><th>Fokus-cue</th><th class="num">Spænding</th><th class="num">Smerte</th><th>Note</th></tr>
        ${data.sessionLogs.map((l) => `
          <tr><td>${esc(new Date(l.created_at).toLocaleString('da-DK'))}</td><td>${esc(l.focus_cue)}</td>
          <td class="num">${l.tension}</td><td class="num">${l.pain >= 5 ? '⚠ ' : ''}${l.pain}</td><td>${esc(l.note)}</td></tr>`).join('')}
      </table>`
    : '<p class="muted">Ingen logs endnu. Udfyld formularen på "I dag" efter en session.</p>';

  document.getElementById('page-sessions').innerHTML = `
    <div class="card">
      <h2>Dine session-logs</h2>
      ${logs}
    </div>
    <h2>Sessioner</h2>
    <p class="muted">En ny session starter efter ${data.sessionGapMinutes} minutters pause. Tiden er fra første til sidste run.</p>
    ${sessions || '<p class="muted">Ingen runs endnu.</p>'}`;
}
