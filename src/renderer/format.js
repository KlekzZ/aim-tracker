// Small helpers used by all pages.

// Scenario names come from files, so we escape them before putting them in
// HTML. Otherwise a strange name could break the page.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Danish number format (comma as decimal). null shows as "-".
function num(value, decimals = 0) {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('da-DK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pct(fraction) {
  return fraction === null || fraction === undefined ? '-' : `${num(fraction * 100)} %`;
}

// "2026-10-17T12:08:07" -> "17.10.2026 12:08"
function dateTime(iso) {
  if (!iso) return '-';
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y} ${time.slice(0, 5)}`;
}
const timeOnly = (iso) => (iso ? iso.split('T')[1].slice(0, 5) : '-');

const normalizeName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

// "VT Raw Control Intermediate S5" -> "Raw Control"
const shortName = (name) => name.replace(/^VT /, '').replace(/ (Novice|Intermediate) S5$/, '');

function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head"><div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div><div>${actions}</div></div>`;
}

function rankBadge(rank) {
  return rank
    ? `<span class="rank r-${rank.toLowerCase()}">${esc(rank)}</span>`
    : '<span class="rank">Ingen rank</span>';
}

// The CSP blocks style="" in HTML, so bar widths go in data-w and are set here.
// fromBaseline = true draws it grey, because it's from the screenshots, not your runs.
function progressBar(fraction, fromBaseline = false) {
  const width = Math.max(0, Math.min(1, fraction || 0));
  return `<div class="progress${fromBaseline ? ' base' : ''}" title="${fromBaseline ? 'Fra baseline (screenshots)' : 'Fra dine runs'}"><div class="bar"><span data-w="${width}"></span></div><span class="pct">${pct(fraction)}</span></div>`;
}
function applyWidths(root) {
  root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w * 100}%`; });
  root.querySelectorAll('[data-left]').forEach((el) => { el.style.left = `${el.dataset.left * 100}%`; });
}

// Which target column belongs to the current plan block.
function currentTargetKey(weekInfo) {
  const week = weekInfo.week || 0;
  if (week <= 4) return { key: 'week4', label: 'Mål uge 4' };
  if (week <= 8) return { key: 'week8', label: 'Mål uge 8' };
  return { key: 'week12', label: 'Mål uge 12' };
}

function targetText(value) {
  if (value === null || value === undefined) return '-';
  return typeof value === 'number' ? num(value) : esc(value);
}

// Rank info for any score (used for the baseline, which the backend
// does not rank). Same rules as src/core/stats.js rankInfo.
function rankFor(score, scenario) {
  if (score === null || score === undefined) return { rank: null, nextRank: scenario.rankNames[0], progress: null };
  let reached = -1;
  scenario.thresholds.forEach((t, i) => { if (score >= t) reached = i; });
  const next = reached + 1;
  const done = next >= scenario.thresholds.length;
  return {
    rank: reached >= 0 ? scenario.rankNames[reached] : null,
    nextRank: done ? null : scenario.rankNames[next],
    nextThreshold: done ? null : scenario.thresholds[next],
    progress: done ? 1 : score / scenario.thresholds[next],
  };
}
