// "Scenarier": every Voltaic scenario with best, median, rank and targets.
// Click a row to see its score trend.

let scenarioTier = 'Intermediate';
let selectedScenario = null;

function targetCell(value) {
  if (value === null || value === undefined) return '-';
  return typeof value === 'number' ? num(value) : esc(value);
}

function renderScenarios(data) {
  const rows = data.scenarios.filter((s) => scenarioTier === 'Alle' || s.tier === scenarioTier);
  if (!selectedScenario || !rows.some((s) => s.name === selectedScenario)) {
    selectedScenario = (rows.find((s) => s.runCount > 0) || rows[0]).name;
  }

  const tableRows = rows.map((s) => `
    <tr class="clickable ${s.name === selectedScenario ? 'selected' : ''}" data-name="${esc(s.name)}">
      <td>${esc(s.name)}</td>
      <td>${esc(s.category)} / ${esc(s.subcategory)}</td>
      <td class="num">${s.runCount}</td>
      <td class="num">${num(s.best, 1)}</td>
      <td class="num">${num(s.medianLast3, 1)}</td>
      <td>${esc(s.rank || '-')}</td>
      <td>${s.nextRank ? `${esc(s.nextRank)} (${num(s.nextThreshold)})` : 'Alle ranks nået'}</td>
      <td><span class="bar"><span style-width="${Math.min(1, s.progress || 0)}"></span></span> ${pct(s.progress)}</td>
      <td class="num">${pct(s.percentOfPlatinum)}</td>
      <td class="num">${num(s.baselineBest, 1)}</td>
      <td class="num">${targetCell(s.target?.week4)}</td>
      <td class="num">${targetCell(s.target?.week8)}</td>
      <td class="num">${targetCell(s.target?.week12)}</td>
    </tr>`).join('');

  const unmatched = data.unmatched.length
    ? `<table><tr><th>Navn i dine filer</th><th class="num">Runs</th></tr>
       ${data.unmatched.map((u) => `<tr><td>${esc(u.name)}</td><td class="num">${u.runCount}</td></tr>`).join('')}</table>`
    : '<p class="muted">Ingen. Alle scenarier i dine filer findes i Voltaic-listen.</p>';

  document.getElementById('page-scenarios').innerHTML = `
    <div class="card">
      <div class="filters">
        <h2>Voltaic S5</h2>
        ${['Intermediate', 'Novice', 'Alle'].map((tier) =>
          `<button class="action ${tier === scenarioTier ? '' : 'secondary-btn'}" data-tier="${tier}">${tier}</button>`).join('')}
      </div>
      <p class="muted">Kun Challenge-runs tæller. "Fremskridt" er bedste score i procent af næste rank. Baseline er dine scores fra screenshots før planen.</p>
      <div class="table-wrap"><table>
        <tr><th>Scenarie</th><th>Kategori</th><th class="num">Runs</th><th class="num">Bedst</th><th class="num">Median sidste 3</th>
            <th>Rank</th><th>Næste rank</th><th>Fremskridt</th><th class="num">% af Plat</th><th class="num">Baseline</th>
            <th class="num">Mål uge 4</th><th class="num">Mål uge 8</th><th class="num">Mål uge 12</th></tr>
        ${tableRows}
      </table></div>
    </div>
    <div class="card">
      <h3>Score over tid: ${esc(selectedScenario)}</h3>
      <div id="trend-empty" class="muted"></div>
      <div class="chart-box"><canvas id="trend-chart"></canvas></div>
    </div>
    <div class="card">
      <h3>Scenarier uden match (unmatched)</h3>
      <p class="muted">Navne fra dine filer, som ikke står i voltaic_s5_thresholds.json. Appen gætter ikke. Hvis et Voltaic-scenarie står her, er navnet anderledes (fx S5.5 i stedet for S5).</p>
      ${unmatched}
    </div>`;

  // The CSP blocks inline style="" attributes, so widths are set from JS.
  document.querySelectorAll('[style-width]').forEach((el) => { el.style.width = `${el.getAttribute('style-width') * 100}%`; });

  document.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
    scenarioTier = b.dataset.tier;
    renderScenarios(data);
  }));
  document.querySelectorAll('tr[data-name]').forEach((tr) => tr.addEventListener('click', () => {
    selectedScenario = tr.dataset.name;
    renderScenarios(data);
  }));

  const summary = data.scenarios.find((s) => s.name === selectedScenario);
  const runs = data.runs
    .filter((r) => r.mode.toLowerCase() === 'challenge' && normalizeName(r.scenario) === normalizeName(selectedScenario))
    .reverse(); // data.runs is newest first; the chart wants oldest first
  document.getElementById('trend-empty').textContent = runs.length ? '' : 'Ingen runs på dette scenarie endnu.';
  drawTrend('trend-chart', runs, summary);
}
