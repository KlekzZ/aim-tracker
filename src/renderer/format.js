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

function warningList(warnings) {
  if (!warnings.length) return '';
  return `<ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
}

const normalizeName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
