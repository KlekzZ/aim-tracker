// "Radar": your best score per subcategory as a percent of a reference rank.
// Voltaic: the 9 subcategories against Platinum.
// Viscose: every "category / subcategory" against a reference rank you can pick.

let radarSet = 'voltaic';
// The reference rank picked per Viscose benchmark (default from the data file).
const pickedReference = {};

// Bars are scaled so 125 % fills the track; the dashed line marks 100 %.
const BAR_SCALE = 1.25;

function radarBar(label, current, baseline, wide = false) {
  return `
    <div class="subbar${wide ? ' wide' : ''}">
      <span>${label}</span>
      <div class="track">
        ${current !== null && current !== undefined ? `<i class="now" data-w="${Math.min(1, current / BAR_SCALE)}"></i>` : ''}
        ${baseline !== null && baseline !== undefined ? `<i class="base" data-w="${Math.min(1, baseline / BAR_SCALE)}"></i>` : ''}
        <span class="plat" data-left="${1 / BAR_SCALE}"></span>
      </div>
      <span class="vals"><b>${pct(current ?? null)}</b>${baseline !== undefined ? ` / ${pct(baseline)}` : ''}</span>
    </div>`;
}

function legendHtml(referenceLabel, showBaseline) {
  return `
    <div class="legend">
      <span><i class="s1"></i>Dine runs</span>
      ${showBaseline ? '<span><i class="s2"></i>Baseline (screenshots)</span>' : ''}
      <span><i class="dash"></i>${esc(referenceLabel)} (100 %)</span>
    </div>`;
}

// Viscose scores are measured against a rank, so recompute the percentages
// when you pick another reference rank.
function viscoseRadar(benchmark, referenceRank) {
  const index = Math.max(0, benchmark.ranks.indexOf(referenceRank));
  const axes = [];
  for (const s of benchmark.scenarios) {
    const key = `${s.category} / ${s.subcategory}`;
    let axis = axes.find((a) => a.key === key);
    if (!axis) { axis = { key, category: s.category, subcategory: s.subcategory, current: null }; axes.push(axis); }
    if (s.best !== null) axis.current = Math.max(axis.current ?? 0, s.best / s.thresholds[index]);
  }
  return axes;
}

function renderRadar(data) {
  const switchHtml = `<div class="segmented">
    <button class="${radarSet === 'voltaic' ? 'on' : ''}" data-radar="voltaic">Voltaic</button>
    ${data.viscose.map((b) => `<button class="${radarSet === b.id ? 'on' : ''}" data-radar="${b.id}">${esc(b.name)}</button>`).join('')}
  </div>`;

  const page = document.getElementById('page-radar');

  if (radarSet === 'voltaic') {
    const hasRuns = data.radar.some((r) => r.current !== null);
    const bars = data.radar.map((r) => radarBar(esc(r.subcategory), r.current, r.baseline)).join('');
    page.innerHTML = `
      ${pageHead('Radar', 'Voltaic Intermediate i procent af Platinum. Bedste scenarie pr. underkategori tæller, ligesom hos Voltaic.', switchHtml)}
      <div class="stack">
      ${hasRuns ? '' : `<div class="alert warning">${icon('alert')}<div>Ingen Voltaic Intermediate-runs endnu, så kun din baseline vises. Spil benchmark-scenarierne for at se "Dine runs".</div></div>`}
      <div class="cols cols-2">
        <div class="card">${legendHtml('Platinum', true)}<div class="chart-box radar"><canvas id="radar-chart"></canvas></div></div>
        <div class="card"><h2>Underkategorier</h2>${legendHtml('Platinum', true)}${bars}</div>
      </div>
      </div>`;
    drawRadar('radar-chart', data.radar);
  } else {
    const benchmark = data.viscose.find((b) => b.id === radarSet);
    const reference = pickedReference[benchmark.id] || benchmark.referenceRank;
    const axes = viscoseRadar(benchmark, reference);
    const hasRuns = axes.some((a) => a.current !== null);
    const missing = axes.filter((a) => a.current === null).length;
    const bars = axes.map((a) => radarBar(`${esc(a.subcategory)}<small class="block muted">${esc(a.category)}</small>`, a.current, undefined, true)).join('');
    const picker = `<label class="small secondary">Mål efter rank
      <select id="reference-rank">${benchmark.ranks.map((r) => `<option ${r === reference ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>`;

    page.innerHTML = `
      ${pageHead('Radar', `${esc(benchmark.name)} i procent af ${esc(reference)}. Bedste scenarie pr. underkategori tæller.`, `${switchHtml} ${picker}`)}
      <div class="stack">
      ${hasRuns ? '' : `<div class="alert warning">${icon('alert')}<div>Ingen ${esc(benchmark.name)}-runs endnu. Spil playlisten for at se din radar.</div></div>`}
      ${hasRuns && missing ? `<div class="alert warning">${icon('alert')}<div>${missing} af ${axes.length} underkategorier mangler en score. Viscose kræver mindst én score i hver for at give en rank.</div></div>` : ''}
      <div class="cols cols-2">
        <div class="card">${legendHtml(reference, false)}<div class="chart-box radar"><canvas id="radar-chart"></canvas></div></div>
        <div class="card"><h2>Underkategorier</h2>${legendHtml(reference, false)}${bars}</div>
      </div>
      </div>`;
    drawRadar('radar-chart', axes, {
      referenceLabel: reference,
      baseline: false,
      labelOf: (a) => [a.subcategory, a.category],
    });
    document.getElementById('reference-rank').addEventListener('change', (e) => {
      pickedReference[benchmark.id] = e.target.value;
      renderRadar(data);
    });
  }

  applyWidths(page);
  page.querySelectorAll('[data-radar]').forEach((b) => b.addEventListener('click', () => {
    radarSet = b.dataset.radar;
    renderRadar(data);
  }));
}
