// The charts: the radar, the score trend for one scenario, kills over the
// course of one run, and precision against score.
// Chart.js is loaded from vendor/ (a local copy, no internet needed).

const charts = {}; // the chart currently drawn on each canvas, so we can replace it

// Read colors from style.css, so charts follow light/dark mode.
function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function replaceChart(canvasId, config) {
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(document.getElementById(canvasId), config);
}

function baseOptions() {
  Chart.defaults.font.family = 'system-ui, "Segoe UI", sans-serif';
  Chart.defaults.color = cssColor('--text-2');
  Chart.defaults.borderColor = cssColor('--grid');
  return { responsive: true, maintainAspectRatio: false, animation: false };
}

// opts.referenceLabel: name of the dashed 100 % ring (default Platinum).
// opts.labelOf: text for each axis (can be an array for two lines).
// opts.baseline: false hides the baseline line (Viscose has none).
function drawRadar(canvasId, radar, opts = {}) {
  const referenceLabel = opts.referenceLabel || 'Platinum';
  const labelOf = opts.labelOf || ((r) => r.subcategory);
  const showBaseline = opts.baseline !== false;
  const series1 = cssColor('--series-1');
  const series2 = cssColor('--series-2');
  const muted = cssColor('--muted');

  replaceChart(canvasId, {
    type: 'radar',
    data: {
      labels: radar.map(labelOf),
      datasets: [
        {
          label: 'Dine runs (bedste pr. underkategori)',
          data: radar.map((r) => r.current),
          borderColor: series1, backgroundColor: series1,
          borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, fill: false,
        },
        ...(showBaseline ? [{
          label: 'Baseline (fra dine screenshots)',
          data: radar.map((r) => r.baseline ?? null),
          borderColor: series2, backgroundColor: series2,
          borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, fill: false,
        }] : []),
        {
          // A reference ring at exactly the reference rank, so 100 % is easy to see.
          label: ` (100 %)`,
          data: radar.map(() => 1),
          borderColor: muted, backgroundColor: muted,
          borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      ...baseOptions(),
      scales: {
        r: {
          min: 0,
          suggestedMax: 1.2,
          grid: { color: cssColor('--grid') },
          angleLines: { color: cssColor('--grid') },
          ticks: { callback: (v) => `${Math.round(v * 100)} %`, backdropColor: 'transparent', color: muted },
          pointLabels: { color: cssColor('--text'), font: { size: 13 } },
        },
      },
      plugins: {
        legend: { display: false }, // the page shows its own legend above the chart
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw === null ? '-' : Math.round(c.raw * 100) + ' %'}` } },
      },
    },
  });
}

// Writes the rank name at the right end of each dashed threshold line.
// Done with a tiny plugin, because the lines all share one muted color.
const thresholdLabels = {
  id: 'thresholdLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle = cssColor('--muted');
    ctx.font = '12px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    chart.data.datasets.forEach((dataset, i) => {
      if (!dataset.thresholdLabel || !chart.isDatasetVisible(i)) return;
      const y = chart.scales.y.getPixelForValue(dataset.data[0]);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.fillText(dataset.thresholdLabel, chartArea.right - 4, y - 4);
    });
    ctx.restore();
  },
};

function drawTrend(canvasId, runs, summary) {
  const series1 = cssColor('--series-1');
  const muted = cssColor('--muted');
  const labels = runs.map((r) => dateTime(r.playedAt));

  // Only draw the rank lines near your scores: the next rank above your best
  // and the ranks within reach below it. With 8 ranks, drawing all of them
  // would squash the score line at the bottom of the chart.
  const scores = runs.map((r) => r.score);
  const lowest = Math.min(...scores);
  const highest = Math.max(...scores);
  const firstAbove = summary.thresholds.findIndex((t) => t > highest);
  const lastShown = firstAbove === -1 ? summary.thresholds.length - 1 : firstAbove;
  const thresholdSets = summary.thresholds
    .map((value, i) => ({ value, i }))
    .filter(({ value, i }) => i <= lastShown && value >= lowest * 0.75)
    .map(({ value, i }) => ({
      label: summary.rankNames[i],
      thresholdLabel: `${summary.rankNames[i]} ${num(value)}`,
      data: runs.map(() => value),
      borderColor: muted, borderWidth: 1, borderDash: [4, 4],
      pointRadius: 0, pointHitRadius: 0,
    }));

  replaceChart(canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Score',
          data: runs.map((r) => r.score),
          borderColor: series1, backgroundColor: series1,
          borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0,
        },
        ...thresholdSets,
      ],
    },
    options: {
      ...baseOptions(),
      interaction: { mode: 'index', intersect: false }, // crosshair-style hover
      scales: {
        x: { grid: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkip: true } },
        y: { grid: { color: cssColor('--grid') }, ticks: { color: muted } },
      },
      plugins: {
        legend: { display: false }, // one series; the title names it
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          // Show the sens used, so you can see if a score came on another sens.
          callbacks: {
            afterLabel: (item) => {
              const cm = runs[item.dataIndex].cm360;
              return cm === null || cm === undefined ? '' : `${num(cm, 1)} cm/360`;
            },
          },
        },
      },
    },
    plugins: [thresholdLabels],
  });
}

// Kills per sixth of the run: does the pace hold?
function drawKillCurve(canvasId, details) {
  const slice = details.duration / details.curve.length;
  replaceChart(canvasId, {
    type: 'bar',
    data: {
      labels: details.curve.map((_, i) => `${num(i * slice)}-${num((i + 1) * slice)} s`),
      datasets: [{ label: 'Kills', data: details.curve, backgroundColor: cssColor('--series-1'), borderRadius: 4 }],
    },
    options: {
      ...baseOptions(),
      scales: {
        x: { grid: { display: false }, ticks: { color: cssColor('--muted'), font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: cssColor('--grid') }, ticks: { color: cssColor('--muted'), precision: 0 } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

// One dot per run: accuracy along the bottom, score up the side. The newest
// five runs are drawn in the second color, so you can see where you are now.
function drawScatter(canvasId, runs) {
  const withAcc = runs.filter((r) => r.accuracy !== null);
  const recent = withAcc.slice(-5);
  const older = withAcc.slice(0, -5);
  const point = (r) => ({ x: r.accuracy * 100, y: r.score, run: r });
  replaceChart(canvasId, {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Ældre runs', data: older.map(point), backgroundColor: cssColor('--series-1'), pointRadius: 4 },
        { label: 'Seneste 5', data: recent.map(point), backgroundColor: cssColor('--series-2'), pointRadius: 5 },
      ],
    },
    options: {
      ...baseOptions(),
      scales: {
        x: { title: { display: true, text: 'Accuracy (%)', color: cssColor('--muted') }, grid: { color: cssColor('--grid') }, ticks: { color: cssColor('--muted') } },
        y: { title: { display: true, text: 'Score', color: cssColor('--muted') }, grid: { color: cssColor('--grid') }, ticks: { color: cssColor('--muted') } },
      },
      plugins: {
        legend: { labels: { color: cssColor('--text-2'), boxWidth: 10 } },
        tooltip: { callbacks: { label: (item) => `${num(item.raw.y, 1)} · ${num(item.raw.x, 1)} % · ${dateTime(item.raw.run.playedAt)}` } },
      },
    },
  });
}
