// Compares a KovaaK's playlist (from kovaaks.com) with the runs you played
// today, so the app can tick off scenarios and say when a session is done.

const normalize = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

// Roughly one minute per run. Most benchmark-style scenarios are 60 seconds,
// plus a few seconds of loading and the score screen.
const MINUTES_PER_RUN = 1.1;

// playlist: { name, code, scenarios: [{ name, playCount }] }
// runsToday: runs from today (any order). Only Challenge runs count.
function playlistProgress(playlist, runsToday) {
  const playedCount = new Map();
  for (const run of runsToday) {
    if ((run.mode || '').toLowerCase() !== 'challenge') continue;
    const key = normalize(run.scenario);
    playedCount.set(key, (playedCount.get(key) || 0) + 1);
  }

  const items = playlist.scenarios.map((scenario) => {
    const need = scenario.playCount || 1;
    const done = playedCount.get(normalize(scenario.name)) || 0;
    return { name: scenario.name, need, done: Math.min(done, need), extra: Math.max(0, done - need) };
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
  };
}

module.exports = { playlistProgress, MINUTES_PER_RUN };
