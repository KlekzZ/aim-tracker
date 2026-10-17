// Talks to KovaaK's in the two ways the owner approved:
// 1. Looks up public playlist contents by share code on kovaaks.com.
//    This is the same unofficial API the kovaaks.com website uses, so it
//    may change. Results are cached in the database (see db.savePlaylist),
//    so we only ask once per playlist and the app works offline after that.
// 2. Opens KovaaK's official deep links (steam://...). Steam starts the game
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

module.exports = { fetchPlaylist, openInKovaaks };
