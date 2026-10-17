// Starts the page: sidebar navigation, loading data, and redrawing when new
// runs show up in the stats folder.

let currentPage = 'today';
let latestData = null;

const RENDERERS = {
  today: renderToday,
  scenarios: renderScenarios,
  radar: renderRadar,
  sessions: renderSessions,
  log: renderLog,
  settings: renderSettings,
};

// Version and update status at the bottom of the sidebar.
function renderSidebarFoot() {
  const status = latestData.updateStatus;
  document.getElementById('sidebar-foot').innerHTML = `
    <div>Version ${esc(latestData.appVersion)}</div>
    ${status.canInstall ? `<button class="btn small" id="foot-install">${icon('download', 15)}Opdater nu</button>` : ''}`;
  const button = document.getElementById('foot-install');
  if (button) button.addEventListener('click', () => window.api.installUpdate());
}

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
  document.querySelector('main').scrollTop = 0;
  // Charts need a visible canvas to get the right size, so draw on show.
  if (latestData) RENDERERS[page](latestData);
}

async function refresh() {
  latestData = await window.api.getData();
  RENDERERS[currentPage](latestData);
  renderSidebarFoot();
}

fillIcons();
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
window.api.onDataChanged(refresh);
window.api.onUpdateStatus((status) => {
  if (!latestData) return;
  latestData.updateStatus = status;
  showUpdateStatus(status);
  renderSidebarFoot();
});
refresh();
