// Compares a playlist (from kovaaks.com, or a list of scenarios from the
// program) with the runs you played, so the app can tick off scenarios and
// say when a session is done.

const normalize = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

// Roughly one minute per run. Most benchmark-style scenarios are 60 seconds,
// plus a few seconds of loading and the score screen.
const MINUTES_PER_RUN = 1.1;

// playlist: { scenarios: [{ name, playCount }] }
// runs: the runs that may count (any order). Only Challenge runs count.
// volume: 0.5 in deload weeks halves the runs (rounded up, at least 1).
function playlistProgress(playlist, runs, volume = 1) {
  const played = new Map(); // scenario -> { count, lastAt }
  for (const run of runs) {
    if ((run.mode || '').toLowerCase() !== 'challenge') continue;
    const key = normalize(run.scenario);
    const entry = played.get(key) || { count: 0, lastAt: null };
    entry.count++;
    if (!entry.lastAt || run.playedAt > entry.lastAt) entry.lastAt = run.playedAt;
    played.set(key, entry);
  }

  let lastPlayedAt = null;
  const items = playlist.scenarios.map((scenario) => {
    const need = Math.max(1, Math.ceil((scenario.playCount || 1) * volume));
    const entry = played.get(normalize(scenario.name)) || { count: 0, lastAt: null };
    if (entry.lastAt && (!lastPlayedAt || entry.lastAt > lastPlayedAt)) lastPlayedAt = entry.lastAt;
    return { name: scenario.name, need, done: Math.min(entry.count, need), extra: Math.max(0, entry.count - need) };
  });

  const totalNeed = items.reduce((sum, item) => sum + item.need, 0);
  const totalDone = items.reduce((sum, item) => sum + item.done, 0);
  return {
    items,
    totalNeed,
    totalDone,
    complete: totalNeed > 0 && totalDone >= totalNeed,
    estimatedMinutes: Math.round(totalNeed * MINUTES_PER_RUN),
    // The first scenario that still needs runs. VDIM wants them in order.
    nextName: (items.find((item) => item.done < item.need) || {}).name || null,
    // When the last run that counted was played (used to date a finished pass).
    lastPlayedAt,
  };
}

module.exports = { playlistProgress, MINUTES_PER_RUN };
