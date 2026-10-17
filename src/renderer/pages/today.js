// "I dag": where you are in the plan, today's routine, status and the session form.

// What you have typed in the form so far. The page redraws when a new run
// arrives, and this keeps your input from disappearing when that happens.
const EMPTY_DRAFT = { cue: '', tension: 3, pain: 0, note: '' };
let draft = { ...EMPTY_DRAFT };

function weekHero(data) {
  const t = data.today;
  const w = t.weekInfo;
  let title;
  if (w.week === null) title = 'Før planen';
  else if (w.week === 0) title = 'Uge 0 <small>opstart og baseline</small>';
  else if (w.week > data.totalWeeks) title = 'Planen er færdig';
  else title = `Uge ${w.week} <small>af ${data.totalWeeks} · blok ${w.block}${w.deload ? ' · deload, 50 % volumen' : ''}</small>`;

  const segments = [];
  for (let week = 1; week <= data.totalWeeks; week++) {
    const classes = ['wk'];
    if (w.week > week) classes.push('done');
    if (w.week === week) classes.push('now');
    if (data.deloadWeeks.includes(week)) classes.push('deload');
    segments.push(`<div class="${classes.join(' ')}" title="Uge ${week}${data.deloadWeeks.includes(week) ? ' (deload)' : ''}"></div>`);
  }

  return `
    <div class="card hero">
      <div class="hero-top">
        <div>
          <div class="date">${esc(t.dayName)} ${esc(t.date.split('-').reverse().join('.'))}</div>
          <div class="week">${title}</div>
        </div>
        <div>
          <div class="today-label">Dagens træning</div>
          <div class="today-value">${esc(t.schedule)}</div>
        </div>
      </div>
      <div class="timeline">${segments.join('')}</div>
      <div class="blocks"><span>Blok 1 · Tracking-kontrol</span><span>Blok 2 · Switching og static</span><span>Blok 3 · Konsolidering</span></div>
    </div>`;
}

function statusTiles(data) {
  const latest = data.latestRun;
  const settingsTile = !latest
    ? { cls: '', ico: 'bolt', value: 'Ingen runs', sub: 'Spil et scenarie i KovaaK\'s' }
    : latest.warnings.length
      ? { cls: 'warning', ico: 'alert', value: `${latest.warnings.length} problem${latest.warnings.length > 1 ? 'er' : ''}`, sub: `Seneste run: ${esc(latest.scenario)}` }
      : { cls: 'good', ico: 'check', value: 'Passer med planen', sub: `Seneste run: ${esc(latest.scenario)}` };

  const session = data.sessions[0];
  const sessionTile = session
    ? { value: `${session.runCount} runs · ${session.minutes} min`, sub: `${dateTime(session.start)} til ${timeOnly(session.end)}` }
    : { value: 'Ingen endnu', sub: 'Sessioner dannes automatisk' };

  const lastLog = data.sessionLogs[0];
  const bodyTile = data.restWarning
    ? { cls: 'critical', ico: 'alert', value: 'Hvil!', sub: 'Smerte 5+ to sessioner i træk' }
    : lastLog
      ? { cls: lastLog.pain >= 5 ? 'warning' : 'good', ico: 'heart', value: `Smerte ${lastLog.pain}/10`, sub: `Spænding ${lastLog.tension}/5 sidst` }
      : { cls: '', ico: 'heart', value: 'Ingen log', sub: 'Udfyld formularen efter træning' };

  const tile = (label, t, ico) => `
    <div class="card tile ${t.cls || ''}">
      <div class="badge-icon">${icon(t.ico || ico, 20)}</div>
      <div><div class="label">${label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>
    </div>`;

  return `<div class="cols cols-3">
    ${tile('Indstillinger', settingsTile, 'bolt')}
    ${tile('Seneste session', sessionTile, 'clock')}
    ${tile('Krop', bodyTile, 'heart')}
  </div>`;
}

function shareCodes(t) {
  if (!t.codes.length) return '<div class="empty">Ingen share code i dag. Hviledag eller udenfor planen.</div>';
  return t.codes.map((c) => `
    <div class="code-card">
      <div><div class="name">${esc(c.name)}</div><code>${esc(c.code)}</code></div>
      <button class="btn ghost small" data-copy="${esc(c.code)}">${icon('copy', 15)}<span>Kopiér</span></button>
    </div>`).join('');
}

// The Intermediate scenarios closest to their next rank. Uses your best run,
// or the baseline from the screenshots if you haven't played it yet.
function closestToRank(data) {
  const rows = data.scenarios
    .filter((s) => s.tier === 'Intermediate')
    .map((s) => {
      const fromRuns = s.best !== null;
      const info = fromRuns ? s : rankFor(s.baselineBest, s);
      return { s, info, fromRuns };
    })
    .filter((r) => r.info.progress !== null && r.info.nextRank)
    .sort((a, b) => b.info.progress - a.info.progress)
    .slice(0, 6);

  if (!rows.length) return '<div class="empty">Ingen data endnu.</div>';
  return `<ul class="closest">${rows.map(({ s, info, fromRuns }) => `
    <li>
      <div class="nm"><b>${esc(shortName(s.name))}</b><small>${esc(s.subcategory)} · ${fromRuns ? 'dine runs' : 'baseline'}</small></div>
      ${rankBadge(info.nextRank)}
      ${progressBar(info.progress, !fromRuns)}
    </li>`).join('')}</ul>`;
}

function scaleButtons(name, from, to, selected) {
  let html = '';
  for (let n = from; n <= to; n++) {
    const high = name === 'pain' && n >= 5 ? ' high' : '';
    html += `<button type="button" class="${n === selected ? 'on' : ''}${high}" data-scale="${name}" data-value="${n}">${n}</button>`;
  }
  return html;
}

function sessionForm() {
  return `
    <form id="session-form" class="card">
      <h2>Log efter session</h2>
      <div class="field">
        <label for="f-cue">Fokus-cue</label>
        <input type="text" id="f-cue" placeholder="fx Prikken klistret til midten af målet" value="${esc(draft.cue)}">
      </div>
      <div class="field">
        <label>Spænding</label>
        <div class="scale">${scaleButtons('tension', 1, 5, draft.tension)}</div>
        <div class="scale-hint"><span>Afslappet</span><span>Meget spændt</span></div>
      </div>
      <div class="field">
        <label>Smerte</label>
        <div class="scale">${scaleButtons('pain', 0, 10, draft.pain)}</div>
        <div class="scale-hint"><span>Ingen</span><span>5+ = stop og hvil</span></div>
      </div>
      <div class="field">
        <label for="f-note">Note</label>
        <textarea id="f-note" rows="3" placeholder="Hvad virkede, hvad gjorde ikke?">${esc(draft.note)}</textarea>
      </div>
      <button type="submit" class="btn">${icon('check', 16)}Gem log</button>
    </form>`;
}

function renderToday(data) {
  const latest = data.latestRun;
  const rest = data.restWarning
    ? `<div class="alert critical">${icon('alert')}<div><b>Hvil!</b> Smerte 5 eller mere i to sessioner i træk.
       Planen siger: stop ved smerte og tag deload med det samme. Vedvarende symptomer skal ses af en fysioterapeut.</div></div>`
    : '';
  const settingsAlert = latest && latest.warnings.length
    ? `<div class="alert warning">${icon('alert')}<div><b>Seneste run (${esc(latest.scenario)}, ${dateTime(latest.playedAt)}) passer ikke med planen</b>
       <ul>${latest.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div>`
    : '';

  const page = document.getElementById('page-today');
  page.innerHTML = `
    <div class="stack">
      ${weekHero(data)}
      ${rest}
      ${statusTiles(data)}
      ${settingsAlert}
      <div class="cols cols-2">
        <div class="stack">
          <div class="card"><h2>Dagens share codes</h2>${shareCodes(data.today)}</div>
          <div class="card"><h2>Tættest på næste rank</h2>${closestToRank(data)}</div>
        </div>
        ${sessionForm()}
      </div>
    </div>`;
  applyWidths(page);

  page.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.querySelector('span').textContent = 'Kopieret';
      setTimeout(() => { button.querySelector('span').textContent = 'Kopiér'; }, 1500);
    });
  });

  page.querySelectorAll('[data-scale]').forEach((button) => {
    button.addEventListener('click', () => {
      draft[button.dataset.scale] = Number(button.dataset.value);
      button.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === button));
    });
  });
  document.getElementById('f-cue').addEventListener('input', (e) => { draft.cue = e.target.value; });
  document.getElementById('f-note').addEventListener('input', (e) => { draft.note = e.target.value; });

  document.getElementById('session-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const entry = { focusCue: draft.cue, tension: draft.tension, pain: draft.pain, note: draft.note };
    draft = { ...EMPTY_DRAFT }; // clear before saving, so the redraw shows an empty form
    await window.api.saveSessionLog(entry);
  });
}
