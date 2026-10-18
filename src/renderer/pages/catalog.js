// "Katalog": search every public playlist and scenario on kovaaks.com, and
// open what you find in KovaaK's. Only the search words leave the computer.
// The last searches are cached in main.js, so they also work offline.

let catalogKind = 'playlists';
let catalogQuery = '';
let catalogResult = null; // { results, cachedAt, error }
let catalogLoading = false;

// Search words that tend to find training for each Voltaic subcategory.
const SUBCATEGORY_SEARCH = {
  Dynamic: 'dynamic clicking', Static: 'static clicking', Linear: 'linear',
  Precise: 'precise tracking', Reactive: 'reactive tracking', Control: 'control tracking',
  Speed: 'speed switching', Evasive: 'evasive', Stability: 'stability',
};

// Your three weakest Voltaic Intermediate subcategories, as quick searches.
function weakestSearches(data) {
  const best = new Map();
  for (const s of data.scenarios) {
    if (s.tier !== 'Intermediate' || s.retired || s.percentOfPlatinum === null) continue;
    best.set(s.subcategory, Math.max(best.get(s.subcategory) || 0, s.percentOfPlatinum));
  }
  return [...best].sort((a, b) => a[1] - b[1]).slice(0, 3)
    .map(([subcategory]) => ({ subcategory, query: SUBCATEGORY_SEARCH[subcategory] || subcategory }));
}

const compact = (n) => (n >= 1e6 ? `${num(n / 1e6, 1)} mio.` : n >= 1e3 ? `${num(n / 1e3, 1)} k` : num(n));

function playlistResult(p, played) {
  const known = p.scenarios.filter((s) => played.has(normalizeName(s.name))).length;
  return `
    <div class="card catalog-item">
      <div class="pl-head">
        <div>
          <div class="name">${esc(p.name)}</div>
          <div class="muted small">${p.author ? `af ${esc(p.author)} · ` : ''}${compact(p.subscribers)} abonnenter · ${p.scenarios.length} scenarier${p.minutes ? ` · ca. ${p.minutes} min` : ''}${p.aimType ? ` · ${esc(p.aimType)}` : ''}</div>
          ${known ? `<div class="muted small">Du har spillet ${known} af dem</div>` : ''}
        </div>
        <div class="pl-buttons">
          <button class="btn small" data-open-playlist="${esc(p.code)}">${icon('bolt', 15)}Åbn i KovaaK's</button>
          <button class="btn ghost small" data-copy="${esc(p.code)}">${icon('copy', 15)}<span>Kopiér kode</span></button>
        </div>
      </div>
      <details>
        <summary>Se scenarierne</summary>
        <ol class="checklist">${p.scenarios.map((s) => `
          <li><span class="tick">${played.has(normalizeName(s.name)) ? icon('check', 14) : ''}</span>
            <span class="sc" data-open-scenario="${esc(s.name)}" title="Åbn i KovaaK's">${esc(s.name)}</span>
            <span class="cnt">×${s.playCount}</span></li>`).join('')}
        </ol>
      </details>
    </div>`;
}

function scenarioResult(s, played) {
  return `
    <div class="card catalog-item">
      <div class="pl-head">
        <div>
          <div class="name">${esc(s.name)} ${played.has(normalizeName(s.name)) ? '<span class="pill good">spillet</span>' : ''}</div>
          <div class="muted small">${s.aimType ? `${esc(s.aimType)} · ` : ''}${compact(s.plays)} spil · ${compact(s.entries)} spillere${s.authors.length ? ` · af ${esc(s.authors.slice(0, 3).join(', '))}` : ''}</div>
        </div>
        <div class="pl-buttons">
          <button class="btn small" data-open-scenario="${esc(s.name)}">${icon('bolt', 15)}Spil i KovaaK's</button>
        </div>
      </div>
      ${s.description ? `<p class="secondary small">${esc(s.description)}</p>` : ''}
    </div>`;
}

function catalogResults(data) {
  if (catalogLoading) return '<div class="empty">Søger på kovaaks.com...</div>';
  if (!catalogResult) return '<div class="empty">Søg efter en playlist eller et scenarie, eller brug et af forslagene ovenfor.</div>';
  const r = catalogResult;
  if (r.error) return `<div class="alert warning">${icon('alert')}<div>Kunne ikke søge: ${esc(r.error)}</div></div>`;
  if (!r.results.length) return '<div class="empty">Ingen resultater.</div>';
  const played = new Set(data.runs.map((run) => normalizeName(run.scenario)));
  const offline = r.cachedAt
    ? `<div class="alert warning">${icon('alert')}<div>kovaaks.com svarer ikke. Du ser resultater fra ${esc(dateTime(r.cachedAt.slice(0, 19)))}.</div></div>`
    : '';
  const items = catalogKind === 'scenarios'
    ? r.results.map((s) => scenarioResult(s, played))
    : r.results.map((p) => playlistResult(p, played));
  return offline + items.join('');
}

async function runCatalogSearch(query) {
  catalogQuery = query;
  catalogLoading = true;
  renderCatalog(latestData);
  catalogResult = await window.api.catalogSearch(catalogKind, query);
  catalogLoading = false;
  if (currentPage === 'catalog') renderCatalog(latestData);
}

function renderCatalog(data) {
  const page = document.getElementById('page-catalog');
  const suggestions = weakestSearches(data);
  page.innerHTML = `
    ${pageHead('Katalog', 'Søg i alle offentlige playlister og scenarier på kovaaks.com. Kun dine søgeord bliver sendt.')}
    <div class="stack">
      <div class="card">
        <form id="catalog-form" class="catalog-search">
          <div class="segmented">
            <button type="button" class="${catalogKind === 'playlists' ? 'on' : ''}" data-kind="playlists">Playlister</button>
            <button type="button" class="${catalogKind === 'scenarios' ? 'on' : ''}" data-kind="scenarios">Scenarier</button>
          </div>
          <input type="text" id="catalog-query" maxlength="60" placeholder="fx smoothbot, viscose, target switching" value="${esc(catalogQuery)}">
          <button type="submit" class="btn">${icon('search', 15)}Søg</button>
        </form>
        ${suggestions.length ? `<div class="pill-row">
          <span class="muted small">Til dine svageste:</span>
          ${suggestions.map((s) => `<button class="btn ghost small" data-quick="${esc(s.query)}">${esc(s.subcategory)}</button>`).join('')}
        </div>` : ''}
      </div>
      ${catalogResults(data)}
    </div>`;

  page.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    if (catalogKind === b.dataset.kind) return;
    catalogKind = b.dataset.kind;
    catalogResult = null;
    if (catalogQuery) runCatalogSearch(catalogQuery);
    else renderCatalog(data);
  }));
  document.getElementById('catalog-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = document.getElementById('catalog-query').value.trim();
    if (query) runCatalogSearch(query);
  });
  page.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => runCatalogSearch(b.dataset.quick)));
  page.querySelectorAll('[data-open-playlist]').forEach((el) => el.addEventListener('click', () =>
    window.api.openInKovaaks({ type: 'playlist', code: el.dataset.openPlaylist })));
  page.querySelectorAll('[data-open-scenario]').forEach((el) => el.addEventListener('click', () =>
    window.api.openInKovaaks({ type: 'scenario', name: el.dataset.openScenario })));
  page.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    const label = button.querySelector('span');
    label.textContent = 'Kopieret';
    setTimeout(() => { label.textContent = 'Kopiér kode'; }, 1500);
  }));
}
