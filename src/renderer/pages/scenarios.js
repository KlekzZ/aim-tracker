// "Scenarier": all Voltaic scenarios grouped by category, with a detail
// panel (numbers, rank ladder, targets and score trend) for the selected one.

let scenarioTier = 'Intermediate';
let selectedScenario = null;

const CATEGORY_ORDER = ['Clicking', 'Tracking', 'Switching'];

function scenarioRow(s, target) {
  // Not played yet: show progress from the baseline (grey) instead of an empty bar.
  const played = s.best !== null;
  const info = played ? s : rankFor(s.baselineBest, s);
  const progress = !info.nextRank
    ? '<span class="pill good">Alle ranks</span>'
    : info.progress === null ? '<span class="muted">-</span>' : progressBar(info.progress, !played);
  return `
    <tr class="clickable ${s.name === selectedScenario ? 'selected' : ''}" data-name="${esc(s.name)}">
      <td class="name-cell"><b>${esc(shortName(s.name))}</b><small>${esc(s.subcategory)}</small></td>
      <td>${played ? rankBadge(s.rank) : '<span class="muted small">Ikke spillet</span>'}</td>
      <td class="num">${num(s.best, 1)}</td>
      <td class="num">${num(s.medianLast3, 1)}</td>
      <td>${progress}</td>
      <td class="num">${targetText(s.target?.[target.key])}</td>
    </tr>`;
}

// Scenarios removed in S5.5 (DriftTS). Shown at the bottom so old runs stay visible.
function retiredRows(rows, target) {
  const retired = rows.filter((s) => s.retired);
  if (!retired.length) return '';
  return `<tr class="group"><td colspan="6">Udgået i S5.5</td></tr>${retired.map((s) => scenarioRow(s, target)).join('')}`;
}

// Challenge runs of one scenario, oldest first (data.runs is newest first).
function scenarioRuns(data, name) {
  return data.runs
    .filter((r) => r.mode.toLowerCase() === 'challenge' && normalizeName(r.scenario) === normalizeName(name))
    .reverse();
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

  return `
    <div class="card stack sticky">
      <div>
        <div class="secondary small">${esc(s.tier)} · ${esc(s.category)} / ${esc(s.subcategory)}</div>
        <h2>${esc(s.name)}</h2>
        ${s.retired ? '<span class="pill">Udgået i S5.5</span> ' : ''}${rankBadge(s.rank)} ${s.nextRank ? `<span class="pill">Næste: ${esc(s.nextRank)} ${num(s.nextThreshold)}</span>` : ''}
      </div>
      <div><button class="btn small" data-open-scenario="${esc(s.name)}">${icon('bolt', 15)}Spil i KovaaK's</button></div>
      <div class="kpis">
        <div class="kpi"><span>Bedst</span><b>${num(s.best, 1)}</b></div>
        <div class="kpi"><span>Median 3</span><b>${num(s.medianLast3, 1)}</b></div>
        <div class="kpi"><span>Baseline</span><b>${num(s.baselineBest, 1)}</b></div>
        <div class="kpi"><span>Runs</span><b>${s.runCount}</b></div>
      </div>
      <div><h3>Ranks</h3><div class="ladder">${ladder}</div></div>
      ${targets}
      <div>
        <h3>Score over tid</h3>
        ${runs.length ? '<div class="chart-box"><canvas id="trend-chart"></canvas></div>' : '<div class="empty">Ingen runs på dette scenarie endnu.</div>'}
      </div>
    </div>`;
}

function renderScenarios(data) {
  const rows = data.scenarios.filter((s) => s.tier === scenarioTier);
  if (!selectedScenario || !rows.some((s) => s.name === selectedScenario)) {
    selectedScenario = (rows.find((s) => s.runCount > 0) || rows[0]).name;
  }
  const selected = data.scenarios.find((s) => s.name === selectedScenario);
  const runs = scenarioRuns(data, selectedScenario);
  const target = currentTargetKey(data.today.weekInfo);

  const body = CATEGORY_ORDER.map((category) => {
    const inCategory = rows.filter((s) => s.category === category && !s.retired);
    return `<tr class="group"><td colspan="6">${category}</td></tr>${inCategory.map((s) => scenarioRow(s, target)).join('')}`;
  }).join('') + retiredRows(rows, target);

  const unmatched = data.unmatched.length
    ? `<table><tr><th>Navn i dine filer</th><th class="num">Runs</th></tr>
       ${data.unmatched.map((u) => `<tr><td>${esc(u.name)}</td><td class="num">${u.runCount}</td></tr>`).join('')}</table>`
    : '<p class="muted">Ingen. Alle scenarier i dine filer findes i Voltaic-listen.</p>';

  const tierSwitch = `<div class="segmented">${['Intermediate', 'Novice'].map((tier) =>
    `<button class="${tier === scenarioTier ? 'on' : ''}" data-tier="${tier}">${tier}</button>`).join('')}</div>`;

  const page = document.getElementById('page-scenarios');
  page.innerHTML = `
    ${pageHead('Scenarier', 'Voltaic S5.5. Kun Challenge-runs tæller. Grå bjælke = fra din baseline, indtil du har spillet scenariet.', tierSwitch)}
    <div class="cols cols-split">
      <div class="stack">
        <div class="card table-wrap">
          <table>
            <tr><th>Scenarie</th><th>Rank</th><th class="num">Bedst</th><th class="num">Median 3</th><th>Mod næste rank</th><th class="num">${target.label}</th></tr>
            ${body}
          </table>
        </div>
        <details class="card">
          <summary>Scenarier uden match (${data.unmatched.length})</summary>
          <p class="muted small">Navne fra dine filer, som ikke står i Voltaic-listen. Appen gætter ikke. VDIM- og træningsscenarier lander her, og det er helt normalt.</p>
          ${unmatched}
        </details>
      </div>
      ${detailPanel(selected, runs)}
    </div>`;
  applyWidths(page);

  page.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
    scenarioTier = b.dataset.tier;
    renderScenarios(data);
  }));
  page.querySelectorAll('tr[data-name]').forEach((tr) => tr.addEventListener('click', () => {
    selectedScenario = tr.dataset.name;
    renderScenarios(data);
  }));

  page.querySelectorAll('[data-open-scenario]').forEach((el) => el.addEventListener('click', () =>
    window.api.openInKovaaks({ type: 'scenario', name: el.dataset.openScenario })));

  if (runs.length) drawTrend('trend-chart', runs, selected);
}
