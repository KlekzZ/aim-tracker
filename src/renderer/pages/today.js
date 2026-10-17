// "I dag": where you are in the plan, today's session (playlist checklist),
// status tiles and the post-session form.

// What you have typed in the form so far. The page redraws when a new run
// arrives, and this keeps your input from disappearing when that happens.
const EMPTY_DRAFT = { cue: '', tension: 3, pain: 0, note: '' };
let draft = { ...EMPTY_DRAFT };

function weekHero(data) {
  const t = data.today;
  const s = data.session;
  // In follow mode the week comes from the pass you are on, not the calendar.
  const w = s.position || { week: null };
  let title;
  if (s.mode === 'follow' && s.status === 'finished') title = 'Programmet er gennemført';
  else if (w.week === null) title = 'Før planen';
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

  const passCount = s.mode === 'follow' && s.total ? `<div class="today-label">${s.done} af ${s.total} pas gennemført</div>` : '';

  return `
    <div class="card hero">
      <div class="hero-top">
        <div>
          <div class="date">${esc(t.dayName)} ${esc(t.date.split('-').reverse().join('.'))}</div>
          <div class="week">${title}</div>
        </div>
        <div class="hero-right">
          <label class="switch" title="Følg planen pas for pas, i stedet for efter kalenderen">
            <input type="checkbox" id="follow-toggle" ${data.followPlan ? 'checked' : ''}>
            <span class="slider"></span><span>Følg planen</span>
          </label>
          <div class="today-label">${s.mode === 'follow' ? 'Dit næste pas' : 'Dagens træning'}</div>
          <div class="today-value">${esc(s.title)}</div>
          ${passCount}
        </div>
      </div>
      <div class="timeline">${segments.join('')}</div>
      <div class="blocks"><span>Blok 1 · Tracking-kontrol</span><span>Blok 2 · Switching og static</span><span>Blok 3 · Konsolidering</span></div>
    </div>`;
}
function statusTiles(data) {
  const latest = data.latestRun;
  const sensTile = latest
    ? { ico: 'target', value: latest.cm360 === null ? `Sens ${num(latest.sens, 2)}` : `${num(latest.cm360, 1)} cm/360`,
        sub: `${esc(latest.sensScale)} ${num(latest.sens, 2)} · ${num(latest.dpi)} DPI (seneste run)` }
    : { ico: 'target', value: 'Ingen runs', sub: 'Spil et scenarie i KovaaK\'s' };

  const session = data.sessions[0];
  const sessionTile = session
    ? { value: `${session.runCount} runs · ${session.minutes} min`, sub: `${dateTime(session.start)} til ${timeOnly(session.end)}` }
    : { value: 'Ingen endnu', sub: 'Sessioner dannes automatisk' };

  const lastLog = data.sessionLogs[0];
  const bodyTile = data.restWarning
    ? { cls: 'critical', ico: 'alert', value: 'Hvil!', sub: 'Smerte 5+ to sessioner i træk' }
    : lastLog
      ? { cls: lastLog.pain >= 5 ? 'warning' : 'good', ico: 'heart', value: `Smerte ${lastLog.pain}/10`, sub: `Spænding ${lastLog.tension}/5 sidst` }
      : { ico: 'heart', value: 'Ingen log', sub: 'Udfyld formularen efter træning' };

  const tile = (label, t, ico) => `
    <div class="card tile ${t.cls || ''}">
      <div class="badge-icon">${icon(t.ico || ico, 20)}</div>
      <div><div class="label">${label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>
    </div>`;

  return `<div class="cols cols-3">
    ${tile('Sens', sensTile, 'target')}
    ${tile('Seneste session', sessionTile, 'clock')}
    ${tile('Krop', bodyTile, 'heart')}
  </div>`;
}

// One part of the session: a playlist (with buttons) or a list of scenarios.
function partBlock(part, playlistStatus) {
  const buttons = part.kind === 'playlist' ? `
    <button class="btn small" data-open-playlist="${esc(part.code)}">${icon('bolt', 15)}Åbn i KovaaK's</button>
    <button class="btn ghost small" data-copy="${esc(part.code)}">${icon('copy', 15)}<span>Kopiér kode</span></button>` : '';
  const sub = part.kind === 'playlist'
    ? `<code>${esc(part.code)}</code>`
    : `<div class="muted small">${esc(part.text || 'Spil hvert scenarie det angivne antal gange. Klik på et navn for at åbne det.')}</div>`;

  const head = `
    <div class="pl-head">
      <div><div class="name">${esc(part.title)}</div>${sub}</div>
      <div class="pl-buttons">${buttons}</div>
    </div>`;

  if (!part.progress) {
    const text = playlistStatus.error ? esc(playlistStatus.text) : 'Henter playlistens indhold fra kovaaks.com...';
    return `<div class="pl">${head}<p class="muted small">${text}</p></div>`;
  }

  const p = part.progress;
  const items = p.items.map((item) => {
    const state = item.done >= item.need ? 'done' : item.name === p.nextName ? 'next' : '';
    return `
      <li class="${state}">
        <span class="tick">${state === 'done' ? icon('check', 14) : ''}</span>
        <span class="sc" title="Åbn i KovaaK's" data-open-scenario="${esc(item.name)}">${esc(item.name)}</span>
        <span class="cnt">${item.done}/${item.need}${item.extra ? ` <small>+${item.extra}</small>` : ''}</span>
      </li>`;
  }).join('');

  return `
    <div class="pl">
      ${head}
      <div class="pl-progress">
        ${progressBar(p.totalDone / p.totalNeed)}
        <span class="secondary small">${p.totalDone} af ${p.totalNeed} runs · ca. ${p.estimatedMinutes} min</span>
      </div>
      ${p.complete ? `<div class="alert good">${icon('check')}<div><b>Færdig!</b> Alle runs i ${esc(part.title)} er spillet.</div></div>` : ''}
      <ol class="checklist">${items}</ol>
    </div>`;
}

const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'numeric' });

// The message shown instead of a checklist when there's nothing to play now.
function sessionMessage(s) {
  switch (s.status) {
    case 'none': return { cls: '', text: 'Ingen træning i dag. Hviledag eller udenfor planen.' };
    case 'finished': return { cls: 'good', text: '<b>Du har gennemført hele programmet!</b> Tid til en stor retest og en ny plan.' };
    case 'pain': return { cls: 'critical', text: '<b>Hvil i dag.</b> Du har logget smerte 5 eller mere to gange i træk. Passet venter på dig, til du er klar.' };
    case 'rest': return { cls: 'good', text: `<b>Hviledag.</b> Ugen er gennemført. Næste pas åbner ${esc(dayLabel(s.opensOn))}.` };
    case 'locked': return { cls: 'good', text: `<b>${s.finishedToday ? 'Dagens pas er gennemført!' : 'Næste pas er ikke åbent endnu.'}</b> Næste pas (${esc(s.title)}) åbner ${esc(dayLabel(s.opensOn))}. Én pas om dagen giver musklerne tid til at restituere.` };
    default: return null;
  }
}

function todaysSession(data) {
  const s = data.session;
  const heading = s.mode === 'follow' ? 'Dit pas' : 'Dagens pas';
  const message = sessionMessage(s);
  if (message) {
    return `<div class="card"><h2>${heading}</h2>
      <div class="alert ${message.cls}">${icon(message.cls === 'critical' ? 'alert' : 'check')}<div>${message.text}</div></div></div>`;
  }

  const steps = s.steps.length
    ? `<div class="steps">${s.steps.map((step) => `
        <div class="step" title="${esc(step.text)}"><b>${step.minutes} min</b><span>${esc(step.name)}</span></div>`).join('')}
      </div>`
    : '';

  const welcomeBack = s.daysWaiting >= 3
    ? `<div class="alert warning">${icon('alert')}<div><b>Velkommen tilbage!</b> Passet har ventet i ${s.daysWaiting} dage. Tag below-level-delen lidt længere i dag, og jag ikke PB'er.</div></div>`
    : '';

  // Escape hatch for follow mode, e.g. if a scenario in a playlist was renamed.
  const escape = s.mode === 'follow' ? `
    <details class="small">
      <summary>Problemer med passet?</summary>
      <p class="muted">Hvis et scenarie er omdøbt eller fjernet, kan passet aldrig blive færdigt af sig selv.
        Så kan du markere det som gennemført og gå videre. Brug det kun i nødstilfælde.</p>
      <button class="btn ghost small" id="mark-done">${icon('check', 15)}Markér som gennemført</button>
    </details>` : '';

  return `
    <div class="card">
      <div class="card-head">
        <h2>${heading}${s.mode === 'follow' ? ` <span class="secondary small">${esc(s.title)}</span>` : ''}</h2>
        ${s.totalMinutes ? `<span class="pill">${icon('clock')}ca. ${s.totalMinutes} min i alt</span>` : ''}
      </div>
      ${s.passText ? `<p class="secondary small">${esc(s.passText)}</p>` : ''}
      ${welcomeBack}
      ${steps}
      ${s.progress.parts.map((part) => partBlock(part, data.playlistStatus)).join('')}
      <p class="muted small">Klik på et scenarie for at åbne det i KovaaK's. Kun Challenge-runs tæller.
        ${s.mode === 'follow' ? 'Passet må gerne deles over flere dage.' : 'Runs fra i dag tæller.'} VDIM skal spilles i rækkefølge.</p>
      ${escape}
    </div>`;
}
// The Intermediate scenarios closest to their next rank. Uses your best run,
// or the baseline from the screenshots if you haven't played it yet.
function closestToRank(data) {
  const rows = data.scenarios
    .filter((s) => s.tier === 'Intermediate' && !s.retired)
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
  const rest = data.restWarning
    ? `<div class="alert critical">${icon('alert')}<div><b>Hvil!</b> Smerte 5 eller mere i to sessioner i træk.
       Planen siger: stop ved smerte og tag deload med det samme. Vedvarende symptomer skal ses af en fysioterapeut.</div></div>`
    : '';

  const page = document.getElementById('page-today');
  page.innerHTML = `
    <div class="stack">
      ${weekHero(data)}
      ${rest}
      ${statusTiles(data)}
      ${todaysSession(data)}
      <div class="cols cols-2">
        <div class="card"><h2>Tættest på næste rank</h2>${closestToRank(data)}</div>
        ${sessionForm()}
      </div>
    </div>`;
  applyWidths(page);

  page.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      const label = button.querySelector('span');
      label.textContent = 'Kopieret';
      setTimeout(() => { label.textContent = 'Kopiér kode'; }, 1500);
    });
  });
  page.querySelectorAll('[data-open-playlist]').forEach((el) => el.addEventListener('click', () =>
    window.api.openInKovaaks({ type: 'playlist', code: el.dataset.openPlaylist })));
  page.querySelectorAll('[data-open-scenario]').forEach((el) => el.addEventListener('click', () =>
    window.api.openInKovaaks({ type: 'scenario', name: el.dataset.openScenario })));

  page.querySelectorAll('[data-scale]').forEach((button) => {
    button.addEventListener('click', () => {
      draft[button.dataset.scale] = Number(button.dataset.value);
      button.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === button));
    });
  });
  document.getElementById('follow-toggle').addEventListener('change', (e) => window.api.setFollowPlan(e.target.checked));
  const markDone = document.getElementById('mark-done');
  if (markDone) {
    markDone.addEventListener('click', () => {
      if (confirm('Markér passet som gennemført uden at have spillet det hele?')) window.api.followMarkDone();
    });
  }
  document.getElementById('f-cue').addEventListener('input', (e) => { draft.cue = e.target.value; });
  document.getElementById('f-note').addEventListener('input', (e) => { draft.note = e.target.value; });

  document.getElementById('session-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const entry = { focusCue: draft.cue, tension: draft.tension, pain: draft.pain, note: draft.note };
    draft = { ...EMPTY_DRAFT }; // clear before saving, so the redraw shows an empty form
    await window.api.saveSessionLog(entry);
  });
}
