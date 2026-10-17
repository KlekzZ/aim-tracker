// Starts the page: tab switching, loading data, and redrawing when new
// runs show up in the stats folder.

let currentPage = 'today';

const RENDERERS = {
  today: renderToday,
  scenarios: renderScenarios,
  radar: renderRadar,
  sessions: renderSessions,
  log: renderLog,
  settings: renderSettings,
};

let latestData = null;

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
  // Charts need a visible canvas to get the right size, so draw on show.
  if (latestData) RENDERERS[page](latestData);
}

async function refresh() {
  latestData = await window.api.getData();
  RENDERERS[currentPage](latestData);
}

document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
window.api.onDataChanged(refresh);
window.api.onUpdateStatus((status) => {
  if (latestData) latestData.updateStatus = status;
  showUpdateStatus(status);
});
refresh();
