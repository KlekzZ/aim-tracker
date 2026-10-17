// "Radar": the 9 Voltaic subcategories as percent of Platinum.

function renderRadar(data) {
  // Bars are scaled so 125 % fills the track; the dashed line marks 100 %.
  const SCALE = 1.25;
  const bars = data.radar.map((r) => `
    <div class="subbar">
      <span>${esc(r.subcategory)}</span>
      <div class="track">
        ${r.current !== null ? `<i class="now" data-w="${Math.min(1, r.current / SCALE)}"></i>` : ''}
        ${r.baseline !== null ? `<i class="base" data-w="${Math.min(1, r.baseline / SCALE)}"></i>` : ''}
        <span class="plat" data-left="${1 / SCALE}"></span>
      </div>
      <span class="vals"><b>${pct(r.current)}</b> / ${pct(r.baseline)}</span>
    </div>`).join('');

  const hasRuns = data.radar.some((r) => r.current !== null);
  const legend = `
    <div class="legend">
      <span><i class="s1"></i>Dine runs</span>
      <span><i class="s2"></i>Baseline (screenshots)</span>
      <span><i class="dash"></i>Platinum (100 %)</span>
    </div>`;

  const page = document.getElementById('page-radar');
  page.innerHTML = `
    ${pageHead('Radar', 'Voltaic Intermediate i procent af Platinum. Bedste scenarie pr. underkategori tæller, ligesom hos Voltaic.')}
    <div class="stack">
    ${hasRuns ? '' : `<div class="alert warning">${icon('alert')}<div>Ingen Voltaic Intermediate-runs endnu, så kun din baseline vises. Spil benchmark-scenarierne for at se "Dine runs".</div></div>`}
    <div class="cols cols-2">
      <div class="card">${legend}<div class="chart-box radar"><canvas id="radar-chart"></canvas></div></div>
      <div class="card"><h2>Underkategorier</h2>${legend}${bars}</div>
    </div>
    </div>`;
  applyWidths(page);

  drawRadar('radar-chart', data.radar);
}
