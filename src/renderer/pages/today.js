// "I dag": plan week, today's routine and share code, warnings, session form.

// What you have typed in the form so far. The page redraws when a new run
// arrives, and this keeps your text from disappearing when that happens.
const EMPTY_DRAFT = { cue: '', tension: '3', pain: '0', note: '' };
let draft = { ...EMPTY_DRAFT };

function renderToday(data) {
  const t = data.today;
  const codes = t.codes.length
    ? t.codes.map((c) => `
        <div class="code-row">
          <span>${esc(c.name)}</span>
          <code>${esc(c.code)}</code>
          <button class="action secondary-btn" data-copy="${esc(c.code)}">Kopiér</button>
        </div>`).join('')
    : '<p class="muted">Ingen share code i planen for i dag.</p>';

  const rest = data.restWarning
    ? `<div class="alert critical"><strong>⚠ Hvil!</strong> Smerte 5 eller mere i to sessioner i træk.
       Planen siger: stop ved smerte og tag deload med det samme. Vedvarende symptomer skal ses af en fysioterapeut.</div>`
    : '';

  const latest = data.latestRun;
  const latestBox = !latest
    ? '<p class="muted">Ingen runs endnu.</p>'
    : latest.warnings.length
      ? `<div class="alert warning"><strong>⚠ Seneste run (${esc(latest.scenario)}, ${dateTime(latest.playedAt)}) passer ikke med planen:</strong>${warningList(latest.warnings)}</div>`
      : `<div class="alert good"><strong>✓ Seneste run</strong> (${esc(latest.scenario)}) havde de rigtige indstillinger.</div>`;

  const session = data.sessions[0];
  const sessionBox = session
    ? `<p><span class="big">${session.runCount}</span> runs, ${session.minutes} min
       <span class="muted">(${dateTime(session.start)} til ${dateTime(session.end).slice(11)})</span></p>`
    : '<p class="muted">Ingen sessioner endnu.</p>';

  document.getElementById('page-today').innerHTML = `
    ${rest}
    <div class="grid">
      <div class="card">
        <h2>${esc(t.dayName[0].toUpperCase() + t.dayName.slice(1))} ${esc(t.date.split('-').reverse().join('.'))}</h2>
        <p class="big">${esc(t.weekInfo.label)}</p>
        <p>Dagens træning: <strong>${esc(t.schedule)}</strong></p>
        ${codes}
      </div>
      <div class="card">
        <h3>Indstillinger</h3>
        ${latestBox}
        <h3>Seneste session</h3>
        ${sessionBox}
      </div>
      <div class="card">
        <h3>Log efter session</h3>
        <form id="session-form">
          <label for="f-cue">Fokus-cue</label>
          <input type="text" id="f-cue" placeholder="fx Prikken klistret til midten af målet" value="${esc(draft.cue)}">
          <div class="row">
            <div><label for="f-tension">Spænding (1-5)</label>
              <select id="f-tension">${[1, 2, 3, 4, 5].map((n) => `<option ${String(n) === draft.tension ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div><label for="f-pain">Smerte (0-10)</label>
              <select id="f-pain">${[...Array(11).keys()].map((n) => `<option ${String(n) === draft.pain ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          </div>
          <label for="f-note">Note</label>
          <textarea id="f-note" rows="2">${esc(draft.note)}</textarea>
          <input type="submit" value="Gem">
        </form>
      </div>
    </div>`;

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Kopieret ✓';
      setTimeout(() => { button.textContent = 'Kopiér'; }, 1500);
    });
  });

  const form = document.getElementById('session-form');
  form.addEventListener('input', () => {
    draft = {
      cue: document.getElementById('f-cue').value,
      tension: document.getElementById('f-tension').value,
      pain: document.getElementById('f-pain').value,
      note: document.getElementById('f-note').value,
    };
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const entry = { focusCue: draft.cue, tension: draft.tension, pain: draft.pain, note: draft.note };
    draft = { ...EMPTY_DRAFT }; // clear before saving, so the redraw shows an empty form
    await window.api.saveSessionLog(entry);
  });
}
