// "Radar": the 9 Voltaic subcategories as percent of Platinum.

function renderRadar(data) {
  const rows = data.radar.map((r) => `
    <tr><td>${esc(r.subcategory)}</td><td class="num">${pct(r.current)}</td><td class="num">${pct(r.baseline)}</td></tr>`).join('');

  document.getElementById('page-radar').innerHTML = `
    <div class="grid">
      <div class="card">
        <h2>Voltaic Intermediate: % af Platinum</h2>
        <p class="muted">Bedste scenarie pr. underkategori, ligesom Voltaic selv regner det. Den stiplede ring er Platinum.</p>
        <div class="chart-box radar"><canvas id="radar-chart"></canvas></div>
      </div>
      <div class="card">
        <h3>Som tabel</h3>
        <table>
          <tr><th>Underkategori</th><th class="num">Nu</th><th class="num">Baseline</th></tr>
          ${rows}
        </table>
      </div>
    </div>`;

  drawRadar('radar-chart', data.radar);
}
