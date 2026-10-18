// "Scenarier": every scenario of a benchmark, grouped by category, with a
// detail panel (numbers, rank ladder, targets and score trend) for the selected one.
// The benchmark switch covers Voltaic (Intermediate, Novice) and Viscose (Easier, Medium, Hard).

let selectedSet = 'voltaic:Intermediate';
let selectedScenario = null;

// The benchmarks shown in the switch at the top.
function benchmarkSets(data) {
  return [
    { key: 'voltaic:Intermediate', label: 'Voltaic Intermediate', scenarios: data.scenarios.filter((s) => s.tier === 'Intermediate'), voltaic: true, code: data.voltaicShareCodes.Intermediate },
    { key: 'voltaic:Novice', label: 'Voltaic Novice', scenarios: data.scenarios.filter((s) => s.tier === 'Novice'), voltaic: true, code: data.voltaicShareCodes.Novice },
    ...data.viscose.map((b) => ({ key: `viscose:${b.id}`, label: b.name, scenarios: b.scenarios, voltaic: false, code: b.shareCode })),
  ];
}

// Categories in the order they appear in the data (Clicking/Tracking/Switching for
// Voltaic, Control Tracking/Reactive Tracking/... for Viscose).
const categoriesOf = (rows) => [...new Set(rows.map((s) => s.category))];

function scenarioRow(s, target, columns) {
  // Not played yet: show progress from the baseline (grey) instead of an empty bar.
  const played = s.best !== null;
  const info = played ? s : rankFor(s.baselineBest, s);
  const progress = !info.nextRank
    ? '<span class="pill good">Alle ranks</span>'
    : info.progress === null ? '<span class="muted">-</span>' : progressBar(info.progress, !played);
  const slow = s.invalidRunCount
    ? ` <span class="pill warning" title="Runs på langsommere sens end ${s.maxCm360} cm/360 tæller ikke i Viscose">${s.invalidRunCount} ugyldig</span>`
    : '';
  return `
    <tr class="clickable ${s.name === selectedScenario ? 'selected' : ''}" data-name="${esc(s.name)}">
      <td class="name-cell"><b>${esc(shortName(s.name))}</b><small>${esc(s.subcategory)}${slow}</small></td>
      <td>${played ? rankBadge(s.rank) : '<span class="muted small">Ikke spillet</span>'}</td>
      <td class="num">${num(s.best, 1)}</td>
      <td class="num">${num(s.medianLast3, 1)}</td>
      <td>${progress}</td>
      ${columns === 6 ? `<td class="num">${targetText(s.target?.[target.key])}</td>` : ''}
    </tr>`;
}

// Challenge runs of one scenario, oldest first (data.runs is newest first).
function scenarioRuns(data, name) {
  return data.runs
    .filter((r) => r.mode.toLowerCase() === 'challenge' && normalizeName(r.scenario) === normalizeName(name))
    .reverse();
}

// Is it real progress or just a good day? The last 3 runs against the
// spread of the 10 before them (src/core/run-analysis.js trendSignal).
function trendBadge(trend) {
  if (!trend) return '';
  if (trend.status === 'few') return `<span class="pill" title="Der skal mindst 6 runs til, før appen kan skelne fremgang fra tilfældigheder.">${trend.runs || 0} runs, for få til en trend</span>`;
  const share = `${trend.diff >= 0 ? '+' : ''}${num(trend.percent * 100, 1)} %`;
  const title = `Median af de sidste 3 runs (${num(trend.recentMedian, 1)}) mod de 10 før (${num(trend.earlierMedian, 1)}). Normal udsving: ±${num(trend.noise, 1)}.`;
  if (trend.status === 'up') return `<span class="pill good" title="${esc(title)}">Reel fremgang ${share}</span>`;
  if (trend.status === 'down') return `<span class="pill warning" title="${esc(title)}">Går ned ${share}</span>`;
  return `<span class="pill" title="${esc(title)}">Stabil (ændringen er inden for normal udsving)</span>`;
}

// What happened inside your latest run, from the per-kill rows. Tracking
// scenarios have no kills, so they get nothing here.
function runAnalysis(runs) {
  const latest = [...runs].reverse().find((r) => r.details && r.details.kills > 1 && r.details.curve);
  if (!latest) return '';
  const d = latest.details;
  const notes = [];
  const drop = d.firstHalf.kills ? (d.secondHalf.kills - d.firstHalf.kills) / d.firstHalf.kills : 0;
  if (drop <= -0.1) notes.push(`Du får ${num(-drop * 100)} % færre kills i anden halvdel. Træthed eller spænding? Prøv at holde grebet løst hele vejen.`);
  else if (drop >= 0.1) notes.push(`Du starter langsomt: ${num(drop * 100)} % flere kills i anden halvdel. En kort opvarmning før kan hjælpe.`);
  else notes.push('Dit tempo holder hele runnet igennem.');
  if (d.firstHalf.accuracy !== null && d.secondHalf.accuracy !== null && d.firstHalf.accuracy - d.secondHalf.accuracy > 0.05) {
    notes.push('Din accuracy falder i anden halvdel.');
  }
  if (d.slowKills >= 3) notes.push(`${d.slowKills} gange tog et kill over 3 gange så lang tid som normalt. Det er dér, du mister flowet.`);
  return `
    <div>
      <h3>Inde i dit seneste run <span class="muted">· ${esc(dateTime(latest.playedAt))}</span></h3>
      <div class="kpis">
        <div class="kpi"><span>1. halvdel</span><b>${d.firstHalf.kills}</b><small>kills · ${pct(d.firstHalf.accuracy)}</small></div>
        <div class="kpi"><span>2. halvdel</span><b>${d.secondHalf.kills}</b><small>kills · ${pct(d.secondHalf.accuracy)}</small></div>
        <div class="kpi" title="Tid mellem kills, median"><span>Tid pr. kill</span><b>${num(d.medianGap, 2)} s</b></div>
        <div class="kpi" title="Hvor meget tiden mellem kills svinger. Lavere er mere stabilt."><span>Udsving</span><b>${num(d.steadiness * 100)} %</b></div>
      </div>
      <div class="chart-box short"><canvas id="curve-chart"></canvas></div>
      <ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>`;
}

function detailPanel(s, runs) {
  const ladder = s.thresholds.map((t, i) => `
    <div class="${s.best !== null && s.best >= t ? 'reached' : ''}">
      <span>${esc(s.rankNames[i])}</span><b>${num(t)}</b>
    </div>`).join('');

  const targets = s.target
    ? `<h3>Mål fra planen</h3>
       <div class="kpis">
         <div class="kpi"><span>Da planen blev lavet</span><b>${targetText(s.target.now)}</b></div>
         <div class="kpi"><span>Uge 4</span><b>${targetText(s.target.week4)}</b></div>
         <div class="kpi"><span>Uge 8</span><b>${targetText(s.target.week8)}</b></div>
         <div class="kpi"><span>Uge 12</span><b>${targetText(s.target.week12)}</b></div>
       </div>`
    : '';

  const tooSlow = s.invalidRunCount
    ? `<div class="alert warning">${icon('alert')}<div><b>${s.invalidRunCount} run${s.invalidRunCount > 1 ? 's' : ''} tæller ikke.</b>
       Viscose siger, at Fingertip-scenarier kun er gyldige på ${s.maxCm360} cm/360 eller hurtigere.</div></div>`
    : '';

  const subtitle = s.tier ? `${esc(s.tier)} · ` : '';
  return `
    <div class="card stack sticky">
      <div>
        <div class="secondary small">${subtitle}${esc(s.category)} / ${esc(s.subcategory)}</div>
        <h2>${esc(s.name)}</h2>
        ${s.retired ? '<span class="pill">Udgået i S5.5</span> ' : ''}${rankBadge(s.rank)} ${s.nextRank ? `<span class="pill">Næste: ${esc(s.nextRank)} ${num(s.nextThreshold)}</span>` : ''}
        <div class="pill-row">${trendBadge(s.trend)}</div>
      </div>
      <div><button class="btn small" data-open-scenario="${esc(s.name)}">${icon('bolt', 15)}Spil i KovaaK's</button></div>
      ${tooSlow}
      <div class="kpis">
        <div class="kpi"><span>Bedst</span><b>${num(s.best, 1)}</b></div>
        <div class="kpi"><span>Median 3</span><b>${num(s.medianLast3, 1)}</b></div>
        <div class="kpi"><span>Baseline</span><b>${num(s.baselineBest, 1)}</b></div>
        <div class="kpi"><span>Runs</span><b>${s.runCount}</b></div>
      </div>
      <div><h3>Ranks</h3><div class="ladder ${s.thresholds.length > 4 ? 'wide' : ''}">${ladder}</div></div>
      ${targets}
      <div>
        <h3>Score over tid</h3>
        ${runs.length ? '<div class="chart-box"><canvas id="trend-chart"></canvas></div>' : '<div class="empty">Ingen runs på dette scenarie endnu.</div>'}
      </div>
      ${runAnalysis(runs)}
      ${runs.filter((r) => r.accuracy !== null).length >= 3 ? `<div>
        <h3>Præcision mod score</h3>
        <p class="muted small">Hver prik er et run. Ligger dine bedste scores ved høj eller lav accuracy? Lav accuracy og høj score betyder, at du spammer. Høj accuracy og lav score betyder, at du kan tage mere tempo.</p>
        <div class="chart-box"><canvas id="scatter-chart"></canvas></div>
      </div>` : ''}
    </div>`;
}

function renderScenarios(data) {
  const sets = benchmarkSets(data);
  const set = sets.find((x) => x.key === selectedSet) || sets[0];
  const rows = set.scenarios;
  if (!selectedScenario || !rows.some((s) => s.name === selectedScenario)) {
    selectedScenario = (rows.find((s) => s.runCount > 0) || rows[0]).name;
  }
  const selected = rows.find((s) => s.name === selectedScenario);
  const runs = scenarioRuns(data, selectedScenario).filter((r) => !selected.maxCm360 || r.cm360 === null || r.cm360 <= selected.maxCm360);
  const target = currentTargetKey(data.today.weekInfo);
  // Only Voltaic has plan targets, so the extra column is left out for Viscose.
  const columns = set.voltaic ? 6 : 5;

  const active = rows.filter((s) => !s.retired);
  const body = categoriesOf(active).map((category) => `
    <tr class="group"><td colspan="${columns}">${esc(category)}</td></tr>
    ${active.filter((s) => s.category === category).map((s) => scenarioRow(s, target, columns)).join('')}`).join('')
    + (rows.some((s) => s.retired)
      ? `<tr class="group"><td colspan="${columns}">Udgået i S5.5</td></tr>${rows.filter((s) => s.retired).map((s) => scenarioRow(s, target, columns)).join('')}`
      : '');

  const unmatched = data.unmatched.length
    ? `<table><tr><th>Navn i dine filer</th><th class="num">Runs</th></tr>
       ${data.unmatched.map((u) => `<tr><td>${esc(u.name)}</td><td class="num">${u.runCount}</td></tr>`).join('')}</table>`
    : '<p class="muted">Ingen. Alle scenarier i dine filer findes i Voltaic- eller Viscose-listen.</p>';

  const setSwitch = `<div class="segmented">${sets.map((x) =>
    `<button class="${x.key === set.key ? 'on' : ''}" data-set="${esc(x.key)}">${esc(x.label)}</button>`).join('')}</div>`;

  const subtitle = set.voltaic
    ? 'Voltaic S5.5. Kun Challenge-runs tæller. Grå bjælke = fra din baseline, indtil du har spillet scenariet.'
    : `${set.label}. Kun Challenge-runs tæller. Du skal have mindst én score i hver underkategori for at få en rank.`;

  const page = document.getElementById('page-scenarios');
  page.innerHTML = `
    ${pageHead('Scenarier', subtitle, `<div class="set-switch">${setSwitch}</div>`)}
    <div class="cols cols-split">
      <div class="stack">
        ${set.code ? `<div class="code-card">
          <div><div class="name">Hele playlisten: ${esc(set.label)}</div><code>${esc(set.code)}</code></div>
          <button class="btn small" data-open-playlist="${esc(set.code)}">${icon('bolt', 15)}Spil i KovaaK's</button>
          <button class="btn ghost small" data-copy="${esc(set.code)}">${icon('copy', 15)}<span>Kopiér</span></button>
        </div>` : ''}
        <div class="card table-wrap">
          <table>
            <tr><th>Scenarie</th><th>Rank</th><th class="num">Bedst</th><th class="num">Median 3</th><th>Mod næste rank</th>${columns === 6 ? `<th class="num">${target.label}</th>` : ''}</tr>
            ${body}
          </table>
        </div>
        <details class="card">
          <summary>Scenarier uden match (${data.unmatched.length})</summary>
          <p class="muted small">Navne fra dine filer, som hverken står i Voltaic- eller Viscose-listen. Appen gætter ikke. VDIM- og træningsscenarier lander her, og det er helt normalt.</p>
          ${unmatched}
        </details>
      </div>
      ${detailPanel(selected, runs)}
    </div>`;
  applyWidths(page);

  page.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
    selectedSet = b.dataset.set;
    selectedScenario = null;
    renderScenarios(data);
  }));
  page.querySelectorAll('tr[data-name]').forEach((tr) => tr.addEventListener('click', () => {
    selectedScenario = tr.dataset.name;
    renderScenarios(data);
  }));
  page.querySelectorAll('[data-open-scenario]').forEach((el) => el.addEventListener('click', () =>
    window.api.openInKovaaks({ type: 'scenario', name: el.dataset.openScenario })));
  page.querySelectorAll('[data-open-playlist]').forEach((el) => el.addEventListener('click', () =>
    window.api.openInKovaaks({ type: 'playlist', code: el.dataset.openPlaylist })));
  page.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    const label = button.querySelector('span');
    label.textContent = 'Kopieret';
    setTimeout(() => { label.textContent = 'Kopiér'; }, 1500);
  }));

  if (runs.length) drawTrend('trend-chart', runs, selected);
  const analysed = [...runs].reverse().find((r) => r.details && r.details.kills > 1 && r.details.curve);
  if (analysed) drawKillCurve('curve-chart', analysed.details);
  if (document.getElementById('scatter-chart')) drawScatter('scatter-chart', runs);
}
