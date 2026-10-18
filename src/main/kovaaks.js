// Talks to KovaaK's in the ways the owner approved:
// 1. Looks up public playlist contents by share code on kovaaks.com.
//    This is the same unofficial API the kovaaks.com website uses, so it
//    may change. Results are cached in the database (see db.savePlaylist),
//    so we only ask once per playlist and the app works offline after that.
// 2. Searches the public catalog of playlists and scenarios (the Katalog page).
// 3. Opens KovaaK's official deep links (steam://...). Steam starts the game
//    on the playlist or scenario. Nothing is written to the game folder.
const { net, shell } = require('electron');

const API = 'https://kovaaks.com/webapp-backend/playlist/playlists';
const STEAM_APP = 'steam://run/824270/';

// Share codes look like "KovaaKsCampingGoatedFamas". Checking the format
// means a strange value can never be turned into some other kind of URL.
const SHARE_CODE = /^KovaaKs[A-Za-z]+$/;

async function fetchPlaylist(code) {
  if (!SHARE_CODE.test(code)) throw new Error(`Ugyldig share code: ${code}`);
  const url = `${API}?page=0&max=5&search=${encodeURIComponent(code)}`;
  const response = await net.fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`kovaaks.com svarede ${response.status}`);

  const body = await response.json();
  // The search can match other playlists too, so pick the exact code.
  const match = (body.data || []).find((p) => (p.playlistCode || '').toLowerCase() === code.toLowerCase());
  if (!match) throw new Error(`Fandt ikke ${code} på kovaaks.com`);

  return {
    code,
    name: match.playlistName,
    // Keep only what we need: name and how many times to play it.
    scenarios: (match.scenarioList || []).map((s) => ({ name: s.scenarioName, playCount: s.playCount || 1 })),
  };
}

function openInKovaaks(target) {
  let url;
  if (target.type === 'playlist' && SHARE_CODE.test(target.code)) {
    url = `${STEAM_APP}?action=jump-to-playlist;sharecode=${target.code}`;
  } else if (target.type === 'scenario' && typeof target.name === 'string' && target.name.length < 200) {
    // KovaaK's wants spaces as %20 in scenario names.
    url = `${STEAM_APP}?action=jump-to-scenario;name=${encodeURIComponent(target.name)}`;
  } else {
    return;
  }
  shell.openExternal(url);
}


// ---------- Catalog: search all public playlists and scenarios ----------
// Only the search words are sent, never anything about you.

const BACKEND = 'https://kovaaks.com/webapp-backend';
const MAX_RESULTS = 20;

function cleanQuery(query) {
  const text = String(query || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 60) throw new Error('Skriv 1 til 60 tegn.');
  return text;
}

async function getJson(url) {
  const response = await net.fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`kovaaks.com svarede ${response.status}`);
  return response.json();
}

async function searchPlaylists(query) {
  const body = await getJson(`${BACKEND}/playlist/playlists?page=0&max=${MAX_RESULTS}&search=${encodeURIComponent(cleanQuery(query))}`);
  return (body.data || [])
    .filter((p) => SHARE_CODE.test(p.playlistCode || ''))
    .map((p) => ({
      name: p.playlistName,
      code: p.playlistCode,
      author: p.webappUsername || p.steamAccountName || null,
      subscribers: p.subscribers || 0,
      aimType: p.aimType || null,
      minutes: p.playlistDuration || null,
      scenarios: (p.scenarioList || []).map((s) => ({ name: s.scenarioName, playCount: s.playCount || 1, aimType: s.aimType || null })),
    }));
}

async function searchScenarios(query) {
  const body = await getJson(`${BACKEND}/scenario/popular?page=0&max=${MAX_RESULTS}&scenarioNameSearch=${encodeURIComponent(cleanQuery(query))}`);
  return (body.data || []).map((s) => ({
    name: s.scenarioName,
    aimType: (s.scenario && s.scenario.aimType) || null,
    description: (s.scenario && s.scenario.description) || '',
    authors: (s.scenario && s.scenario.authors) || [],
    plays: (s.counts && s.counts.plays) || 0,
    entries: (s.counts && s.counts.entries) || 0,
  }));
}

module.exports = { fetchPlaylist, openInKovaaks, searchPlaylists, searchScenarios };
