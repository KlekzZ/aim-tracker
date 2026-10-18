// "Coach": a local AI that answers questions using only the sources you add
// (your own notes, deep research, video transcripts) plus, optionally, your
// current stats. Everything runs on Ollama on your own computer.

let asking = false;
let streamingAnswer = null; // accumulated text while a reply is streaming in
let includeStats = true;
let importMessage = '';

// Called by app.js as tokens arrive, so the bubble grows live.
function appendCoachToken(piece) {
  streamingAnswer = (streamingAnswer || '') + piece;
}

// Roughly how big each model is, so the download isn't a surprise.
const MODEL_SIZES = { 'nomic-embed-text': '~280 MB', 'qwen2.5:14b': '~9 GB', 'llama3.1:8b': '~4,9 GB', 'qwen2.5:7b': '~4,7 GB' };
const modelSize = (model) => MODEL_SIZES[model] || '';

function setupStep(number, done, title, body) {
  return `
    <div class="step-row ${done ? 'done' : ''}">
      <div class="step-num">${done ? icon('check', 16) : number}</div>
      <div class="step-body"><b>${title}</b>${body ? `<div class="step-text">${body}</div>` : ''}</div>
    </div>`;
}

// The whole Coach setup as numbered steps, so a brand new user (or a friend
// you give the app to) can see exactly where they are and what is missing.
function setupCard(data) {
  const s = data.ollamaStatus;
  const cfg = data.coachConfig;
  if (s.checking) return `<div class="card"><p class="muted">Tjekker Ollama...</p></div>`;

  const ready = s.installed && s.running && s.embedReady && s.chatReady;
  if (ready) {
    return `<div class="card tile good"><div class="badge-icon">${icon('check', 20)}</div>
      <div><div class="label">Ollama</div><div class="value">Klar</div><div class="sub">${esc(cfg.chatModel)} · kører lokalt på din computer</div></div></div>`;
  }

  const pulling = data.pullStatus.model;
  const modelStep = (model, installed) => {
    if (installed) return `<span class="pill good">${icon('check')}Hentet</span>`;
    if (pulling === model) {
      const percent = data.pullStatus.percent;
      return `<div class="pull-row">
        <div class="bar"><span data-w="${(percent || 0) / 100}"></span></div>
        <span class="small secondary">${esc(data.pullStatus.text)}${percent !== null ? ` ${percent} %` : ''}</span>
      </div>`;
    }
    return `<button class="btn small" data-pull="${esc(model)}" ${pulling ? 'disabled' : ''}>${icon('download', 15)}Hent ${esc(model)} (${modelSize(model)})</button>`;
  };

  return `
    <div class="card stack">
      <div>
        <h2>Sådan får du Coach i gang</h2>
        <p class="muted small">Coach bruger Ollama: et gratis program, der kører AI-modeller lokalt på din egen maskine.
          Intet bliver sendt ud på nettet, bortset fra selve download af modellerne.</p>
      </div>

      ${setupStep(1, s.installed, 'Installér Ollama', s.installed
        ? '<span class="muted">Fundet på din computer.</span>'
        : `<div class="muted">Hent og installér Ollama. Det tager et par minutter, og derefter ligger det i baggrunden.</div>
           <button class="btn small" data-open-link="https://ollama.com/download">${icon('download', 15)}Åbn ollama.com/download</button>
           <button class="btn ghost small" id="check-ollama">${icon('refresh', 15)}Jeg har installeret det</button>`)}

      ${setupStep(2, s.running, 'Start Ollama', s.running
        ? '<span class="muted">Kører nu.</span>'
        : s.installed
          ? `<div class="muted">Ollama skal køre i baggrunden, før Coach kan svare.</div>
             <button class="btn small" id="start-ollama">${icon('bolt', 15)}Start Ollama</button>
             <button class="btn ghost small" id="check-ollama">${icon('refresh', 15)}Tjek igen</button>`
          : '<span class="muted">Kommer efter trin 1.</span>')}

      ${setupStep(3, s.embedReady && s.chatReady, 'Hent modellerne', s.running
        ? `<div class="muted">Et engangs-download. Den store model bruger dit grafikkort, når du stiller spørgsmål.</div>
           <div class="model-rows">
             <div class="model-row"><span>Søgemodel <code>${esc(cfg.embedModel)}</code></span>${modelStep(cfg.embedModel, s.embedReady)}</div>
             <div class="model-row"><span>Chat-model <code>${esc(cfg.chatModel)}</code></span>${modelStep(cfg.chatModel, s.chatReady)}</div>
           </div>
           ${data.pullStatus.error ? `<p class="small changed">${esc(data.pullStatus.error)}</p>` : ''}`
        : '<span class="muted">Kommer efter trin 2.</span>')}
    </div>`;
}

function sourceRow(source) {
  return `
    <div class="source-row">
      <div class="nm"><b>${esc(source.title)}</b>
        <small>${esc(source.kind)} · ${source.chunkCount} stykker${source.pendingCount ? ` · ${source.pendingCount} venter` : ''}</small>
      </div>
      <button class="btn ghost small" data-remove-source="${esc(source.id)}" title="Fjern kilde">${icon('trash', 15)}</button>
    </div>`;
}

function citationChips(citations) {
  if (!citations || !citations.length) return '';
  return `<div class="citations">${citations.map((c, i) => {
    const label = esc(c.metaTitle || c.headingPath || 'Kilde');
    return c.metaUrl
      ? `<button class="pill citation" data-open-link="${esc(c.metaUrl)}">[${i + 1}] ${label}</button>`
      : `<span class="pill citation" title="${esc(c.headingPath || '')}">[${i + 1}] ${label}</span>`;
  }).join('')}</div>`;
}

function messageBubble(message) {
  if (message.role === 'error') {
    return `<div class="msg error"><div class="alert critical">${icon('alert')}<div>${esc(message.content)}</div></div></div>`;
  }
  const role = message.role === 'user' ? 'user' : 'assistant';
  return `<div class="msg ${role}"><div class="bubble">${esc(message.content).replace(/\n/g, '<br>')}</div>${role === 'assistant' ? citationChips(message.citations) : ''}</div>`;
}

function renderCoach(data) {
  const messages = data.coachMessages;
  // The real answer has arrived and been persisted: drop the live bubble.
  const lastRole = messages[messages.length - 1] && messages[messages.length - 1].role;
  if (lastRole && lastRole !== 'user') { asking = false; streamingAnswer = null; }

  const ready = data.ollamaStatus.running && data.ollamaStatus.embedReady && data.ollamaStatus.chatReady;
  const chatList = messages.map(messageBubble).join('')
    + (asking ? `<div class="msg assistant"><div class="bubble">${streamingAnswer ? esc(streamingAnswer).replace(/\n/g, '<br>') : '<span class="muted">Tænker...</span>'}</div></div>` : '');

  const page = document.getElementById('page-coach');
  page.innerHTML = `
    ${pageHead('Coach', 'En lokal AI, der kun kender dine egne kilder. Alt kører på din egen computer, intet sendes ud over det.')}
    ${setupCard(data)}
    <div class="cols cols-split" style-gap>
      <div class="card chat-card">
        <div class="card-head">
          <h2>Samtale</h2>
          <button class="btn ghost small" id="clear-chat">${icon('trash', 15)}Ryd samtale</button>
        </div>
        <div class="chat-list" id="chat-list">${chatList || '<div class="empty">Stil et spørgsmål om din træning, fx "Hvorfor er min Reactive tracking svag, og hvad skal jeg øve?"</div>'}</div>
        <form id="coach-form" class="coach-input">
          <textarea id="coach-question" rows="2" placeholder="${ready ? 'Skriv dit spørgsmål...' : 'Ollama skal være klar først...'}" ${ready ? '' : 'disabled'}></textarea>
          <div class="coach-input-row">
            <label class="toggle small"><input type="checkbox" id="include-stats" ${includeStats ? 'checked' : ''}>Brug mine tal (ranks, svageste kategori, smerte)</label>
            <button type="submit" class="btn" ${ready && !asking ? '' : 'disabled'}>${icon('send', 15)}Send</button>
          </div>
        </form>
      </div>
      <div class="card stack">
        <div class="card-head"><h2>Kilder</h2><button class="btn ghost small" id="add-source">${icon('book', 15)}Tilføj kilde</button></div>
        <p class="muted small">Dine egne noter, deep research eller video-transskripter (.md / .txt). De bliver aldrig sendt nogen steder, kun brugt lokalt af Ollama.</p>
        ${importMessage ? `<p class="small changed">${esc(importMessage)}</p>` : ''}
        ${data.embedStatus.busy ? `<p class="small secondary">${icon('refresh', 14)} ${esc(data.embedStatus.text)}</p>` : ''}
        ${data.knowledgeSources.length ? data.knowledgeSources.map(sourceRow).join('') : '<div class="empty">Ingen kilder endnu.</div>'}
      </div>
    </div>`;
  page.querySelectorAll('[style-gap]').forEach((el) => { el.style.marginTop = '16px'; });

  document.getElementById('chat-list').scrollTop = document.getElementById('chat-list').scrollHeight;

  const checkButton = document.getElementById('check-ollama');
  if (checkButton) checkButton.addEventListener('click', () => window.api.checkOllama());
  const startButton = document.getElementById('start-ollama');
  if (startButton) startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    startButton.textContent = 'Starter...';
    await window.api.startOllama();
  });
  page.querySelectorAll('[data-pull]').forEach((button) => button.addEventListener('click', () => window.api.pullModel(button.dataset.pull)));

  page.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    const label = button.querySelector('span');
    label.textContent = 'Kopieret';
    setTimeout(() => { label.textContent = 'Kopiér'; }, 1500);
  }));
  page.querySelectorAll('[data-open-link]').forEach((el) => el.addEventListener('click', () => window.api.openExternal(el.dataset.openLink)));

  document.getElementById('add-source').addEventListener('click', async () => {
    importMessage = 'Tilføjer...';
    renderCoach(data);
    const result = await window.api.addKnowledgeSource();
    importMessage = result.added || result.problems.length
      ? `Tilføjede ${result.added} kilde(r).${result.problems.length ? ' Problemer: ' + result.problems.join('; ') : ''}`
      : '';
  });
  page.querySelectorAll('[data-remove-source]').forEach((button) => button.addEventListener('click', () => {
    if (confirm('Fjern denne kilde og alt dens indhold fra Coach?')) window.api.removeKnowledgeSource(button.dataset.removeSource);
  }));

  document.getElementById('clear-chat').addEventListener('click', () => {
    if (confirm('Ryd hele samtalen?')) window.api.clearCoachChat();
  });
  document.getElementById('include-stats').addEventListener('change', (e) => { includeStats = e.target.checked; });

  document.getElementById('coach-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const field = document.getElementById('coach-question');
    const question = field.value.trim();
    if (!question || asking) return;
    asking = true;
    streamingAnswer = null;
    field.value = '';
    window.api.askCoach(question, includeStats);
    renderCoach(data); // optimistic: shows "Tænker..." right away
  });
}
