// Deeper looks at your runs:
//  - analyzeKills: what happened inside one run (did you slow down, how
//    steady were you, how many slow kills)
//  - trendSignal: is a change real progress, or just normal ups and downs?
//  - findRecords: new personal bests and rank-ups
//  - weeklySummary: this week compared with the week before
// Pure functions: data in, data out. Easy to test.

const CURVE_BUCKETS = 6; // the run split into six equal slices of time

function median(numbers) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// "09:36:13.303" -> seconds since midnight.
function secondsOfDay(time) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(String(time || '').trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

// ---------- Inside one run ----------

// rows: [{ time, ttk, shots, hits }] from the per-kill table.
// challengeStart: "09:35:13.120" from the file. playedAt: when the file was
// written (the end of the run), e.g. "2026-10-18T09:36:13".
function analyzeKills(rows, challengeStart, playedAt) {
  if (!rows.length) return { kills: 0 };

  const start = secondsOfDay(challengeStart);
  let end = secondsOfDay(String(playedAt || '').split('T')[1]);
  const times = rows.map((row) => secondsOfDay(row.time));
  if (start === null || end === null || times.some((t) => t === null)) return { kills: rows.length };
  // A run that started just before midnight ends "earlier" in the day.
  const fix = (t) => (t < start - 1 ? t + 86400 : t);
  if (end < start) end += 86400;
  const offsets = times.map((t) => fix(t) - start);
  const duration = Math.max(end - start, offsets[offsets.length - 1], 1);

  // Kills per slice of the run: does your pace hold to the end?
  const curve = new Array(CURVE_BUCKETS).fill(0);
  offsets.forEach((t) => { curve[Math.min(CURVE_BUCKETS - 1, Math.floor((t / duration) * CURVE_BUCKETS))]++; });

  const half = duration / 2;
  const sumOf = (list, key) => list.reduce((sum, row) => sum + row[key], 0);
  const firstRows = rows.filter((_, i) => offsets[i] < half);
  const secondRows = rows.filter((_, i) => offsets[i] >= half);
  const acc = (list) => (sumOf(list, 'shots') ? sumOf(list, 'hits') / sumOf(list, 'shots') : null);

  // Time between kills. A few very long gaps are the "lost the target" moments.
  const gaps = offsets.slice(1).map((t, i) => t - offsets[i]);
  const gapMedian = median(gaps);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const sd = gaps.length > 1 ? Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / (gaps.length - 1)) : null;

  return {
    kills: rows.length,
    duration: Math.round(duration),
    curve,
    firstHalf: { kills: firstRows.length, accuracy: acc(firstRows) },
    secondHalf: { kills: secondRows.length, accuracy: acc(secondRows) },
    medianGap: gapMedian === null ? null : Math.round(gapMedian * 1000) / 1000,
    // How much the gaps vary, relative to their average. Lower = steadier.
    steadiness: mean && sd !== null ? Math.round((sd / mean) * 100) / 100 : null,
    // Gaps more than three times your usual: moments you lost the flow.
    slowKills: gapMedian ? gaps.filter((g) => g > gapMedian * 3).length : 0,
  };
}

// ---------- Real progress or noise? ----------

// scores in time order. Compares your last 3 runs with the runs before them,
// and measures how much your single runs normally jump around. A change only
// counts as real when it is bigger than that normal jumping around.
function trendSignal(scores) {
  if (scores.length < 6) return { status: 'few', runs: scores.length };
  const recent = scores.slice(-3);
  const earlier = scores.slice(-13, -3);
  const earlierMedian = median(earlier);
  const recentMedian = median(recent);
  // Median absolute deviation, scaled to be comparable to a standard deviation.
  const mad = median(earlier.map((s) => Math.abs(s - earlierMedian))) * 1.4826;
  const noise = Math.max(mad, Math.abs(earlierMedian) * 0.01);
  const diff = recentMedian - earlierMedian;
  let status = 'flat';
  if (diff > noise) status = 'up';
  else if (diff < -noise) status = 'down';
  return {
    status,
    runs: scores.length,
    recentMedian,
    earlierMedian,
    diff,
    noise,
    percent: earlierMedian ? diff / earlierMedian : null,
  };
}

// ---------- Personal bests and rank-ups ----------

// runs: all runs, oldest first. ladders: Map of normalized scenario name ->
// { thresholds, ranks }. Returns events newest first. Your very first run of
// a scenario is not a "new best", there was nothing to beat yet.
function findRecords(runs, ladders, normalize) {
  const best = new Map();
  const events = [];
  const rankIndex = (score, ladder) => ladder.thresholds.reduce((idx, t, i) => (score >= t ? i : idx), -1);

  for (const run of runs) {
    if ((run.mode || '').toLowerCase() !== 'challenge') continue;
    const key = normalize(run.scenario);
    const previous = best.get(key);
    if (previous === undefined) { best.set(key, run.score); continue; }
    if (run.score <= previous) continue;

    const ladder = ladders.get(key);
    const before = ladder ? rankIndex(previous, ladder) : -1;
    const after = ladder ? rankIndex(run.score, ladder) : -1;
    events.push({
      playedAt: run.playedAt,
      scenario: run.scenario,
      score: run.score,
      previous,
      gain: (run.score - previous) / previous,
      rank: after > before ? ladder.ranks[after] : null, // set when you reached a new rank
    });
    best.set(key, run.score);
  }
  return events.reverse();
}

// ---------- This week vs last week ----------

function weeklySummary(runs, records, todayIso, normalize) {
  const day = (iso) => new Date(`${iso}T12:00:00`);
  const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);
  const challenge = runs.filter((run) => (run.mode || '').toLowerCase() === 'challenge');
  const thisWeek = challenge.filter((r) => { const d = daysBetween(r.playedAt.slice(0, 10), todayIso); return d >= 0 && d < 7; });
  const lastWeek = challenge.filter((r) => { const d = daysBetween(r.playedAt.slice(0, 10), todayIso); return d >= 7 && d < 14; });

  // Median score per scenario in each week, for scenarios played in both.
  const medians = (list) => {
    const groups = new Map();
    for (const run of list) {
      const key = normalize(run.scenario);
      if (!groups.has(key)) groups.set(key, { name: run.scenario, scores: [] });
      groups.get(key).scores.push(run.score);
    }
    return groups;
  };
  const now = medians(thisWeek);
  const before = medians(lastWeek);
  const changes = [];
  for (const [key, entry] of now) {
    if (!before.has(key)) continue;
    const a = median(before.get(key).scores);
    const b = median(entry.scores);
    if (a) changes.push({ scenario: entry.name, before: a, after: b, change: (b - a) / a });
  }
  changes.sort((x, y) => y.change - x.change);

  const perDay = new Map();
  thisWeek.forEach((run) => perDay.set(run.playedAt.slice(0, 10), (perDay.get(run.playedAt.slice(0, 10)) || 0) + 1));
  const busiest = [...perDay].sort((a, b) => b[1] - a[1])[0] || null;

  return {
    runs: thisWeek.length,
    runsLastWeek: lastWeek.length,
    days: perDay.size,
    newBests: records.filter((r) => daysBetween(r.playedAt.slice(0, 10), todayIso) < 7).length,
    rankUps: records.filter((r) => r.rank && daysBetween(r.playedAt.slice(0, 10), todayIso) < 7).length,
    improved: changes.filter((c) => c.change > 0).slice(0, 3),
    dropped: changes.filter((c) => c.change < 0).slice(-3).reverse(),
    busiestDay: busiest ? { date: busiest[0], runs: busiest[1] } : null,
  };
}

module.exports = { analyzeKills, trendSignal, findRecords, weeklySummary, median, secondsOfDay };
