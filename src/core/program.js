// Turns a program file (data/program.json) into a list of passes, and works
// out how far you are in the current pass.
//
// A "pass" is one training session, e.g. "Week 3, Tuesday: VDIM Adept Clicking I".
// It has one or more "parts": a KovaaK's playlist (share code) or a fixed list
// of scenarios. Pure functions: no files, no database. Easy to test.
const { playlistProgress } = require('./playlist-progress');

const DAY_NAMES_DA = { Mon: 'Mandag', Tue: 'Tirsdag', Wed: 'Onsdag', Thu: 'Torsdag', Fri: 'Fredag', Sat: 'Lørdag', Sun: 'Søndag' };

// Turns one part from the program file into { kind, code?, title, scenarios? }.
function resolvePart(part, week, block, program) {
  if (part.viscose_by_block) {
    const viscose = program.viscose_by_block[String(block)];
    return {
      kind: 'scenarios',
      title: viscose.title,
      text: viscose.text || null,
      scenarios: viscose.scenarios.map((name) => ({ name, playCount: part.runs_each || 3 })),
    };
  }
  if (part.playlist_odd_week) {
    const odd = week % 2 === 1;
    return {
      kind: 'playlist',
      code: odd ? part.playlist_odd_week : part.playlist_even_week,
      title: odd ? part.title_odd_week : part.title_even_week,
    };
  }
  return { kind: 'playlist', code: part.playlist, title: part.title };
}

// The whole program as a flat list of passes, in the order you play them.
function buildPasses(program) {
  const passes = [];
  program.week0.forEach((pass, i) => {
    passes.push({
      id: `w0-${i + 1}`, week: 0, block: 0, deload: false, day: null,
      label: pass.label, text: pass.text || null, restAfter: false,
      parts: pass.parts.map((part) => resolvePart(part, 0, 0, program)),
    });
  });

  for (let week = 1; week <= program.total_weeks; week++) {
    const block = Math.ceil(week / 4);
    const deload = program.deload_weeks.includes(week);
    program.week.forEach((day, i) => {
      const isLastDay = i === program.week.length - 1;
      // In deload weeks the last day is a full benchmark test instead.
      const test = deload && isLastDay ? program.deload_tests[String(week)] : null;
      passes.push({
        id: `w${week}-${day.day}`,
        week, block, deload, day: day.day,
        label: test ? 'Benchmark-test' : day.label,
        text: test ? 'Fuld test, når du er frisk. Spilles i fuld længde.' : null,
        isTest: Boolean(test),
        restAfter: isLastDay, // a rest day follows the last pass of each week
        parts: (test || day.parts).map((part) => resolvePart(part, week, block, program)),
      });
    });
  }
  return passes;
}

// A short name for the pass, e.g. "Uge 3 · Tirsdag".
function passTitle(pass) {
  if (pass.week === 0) return 'Uge 0';
  return `Uge ${pass.week} · ${DAY_NAMES_DA[pass.day]}`;
}

// How far you are in a pass. runs = the runs that may count (played since
// the pass opened). playlists = cached kovaaks.com playlists by code.
function passProgress(pass, runs, playlists, deloadVolume) {
  // Benchmark tests are always played in full, even in deload weeks.
  const volume = pass.deload && !pass.isTest ? deloadVolume : 1;
  const parts = pass.parts.map((part) => {
    const source = part.kind === 'scenarios' ? { scenarios: part.scenarios } : playlists[part.code];
    return { ...part, playlistName: source && source.name ? source.name : null,
      progress: source ? playlistProgress(source, runs, volume) : null };
  });
  const ready = parts.every((p) => p.progress);
  const lastTimes = parts.map((p) => p.progress && p.progress.lastPlayedAt).filter(Boolean).sort();
  return {
    parts,
    // Unknown until every playlist has been looked up on kovaaks.com.
    complete: ready && parts.every((p) => p.progress.complete),
    lastPlayedAt: lastTimes[lastTimes.length - 1] || null,
    estimatedMinutes: parts.reduce((sum, p) => sum + (p.progress ? p.progress.estimatedMinutes : 0), 0),
  };
}

module.exports = { buildPasses, passProgress, passTitle };
