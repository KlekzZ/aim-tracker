// "Følg planen": a pointer to the pass you are on.
//
// The rules (from the plan and the owner's wishes):
// - You only move on when the current pass is finished (all its runs played).
//   A pass may be split over several days.
// - Only runs from the day the pass opened count, so extra runs after you
//   finished yesterday's pass don't count towards today's.
// - One pass per day: the next pass opens the day after you finish.
// - After the last pass of a week there is a rest day.
// - Missing days doesn't skip anything: the pointer waits for you.
//
// state = { index, openedOn: 'YYYY-MM-DD', history: [{ id, completedOn, manual? }] }
// Pure functions: they return a new state instead of saving anything.
const { passProgress } = require('./program');
const { localDate, isoDay } = require('./plan');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(day, n) {
  const date = localDate(day);
  date.setDate(date.getDate() + n);
  return isoDay(date);
}

function daysBetween(fromDay, toDay) {
  return Math.round((localDate(toDay) - localDate(fromDay)) / MS_PER_DAY);
}

function startState(index, today) {
  return { index, openedOn: today, history: [] };
}

// The runs that count for a pass: played on or after the day it opened.
const runsSince = (runs, day) => runs.filter((run) => run.playedAt >= `${day}T00:00:00`);

// Moves the pointer past every pass that is finished. Normally that's at most
// one, but if the app was closed for a few days it catches up.
function advance(state, passes, runs, playlists, deloadVolume, today) {
  let next = { ...state, history: [...state.history] };
  let changed = false;
  while (next.index < passes.length && next.openedOn <= today) {
    const pass = passes[next.index];
    const progress = passProgress(pass, runsSince(runs, next.openedOn), playlists, deloadVolume);
    if (!progress.complete) break;
    const completedOn = progress.lastPlayedAt.slice(0, 10);
    next.history.push({ id: pass.id, completedOn });
    next = { ...next, index: next.index + 1, openedOn: addDays(completedOn, pass.restAfter ? 2 : 1) };
    changed = true;
  }
  return { state: next, changed };
}

// For the "Markér som gennemført" escape hatch (e.g. a scenario was renamed).
function markDone(state, passes, today) {
  const pass = passes[state.index];
  if (!pass) return state;
  return {
    index: state.index + 1,
    openedOn: addDays(today, pass.restAfter ? 2 : 1),
    history: [...state.history, { id: pass.id, completedOn: today, manual: true }],
  };
}

// Everything the page needs to show the current pass.
function followView(state, passes, runs, playlists, deloadVolume, today) {
  const base = { index: state.index, total: passes.length, done: state.history.length };
  if (state.index >= passes.length) return { ...base, status: 'finished' };

  const pass = passes[state.index];
  const lastDone = state.history[state.history.length - 1] || null;
  const finishedToday = Boolean(lastDone && lastDone.completedOn === today);

  if (state.openedOn > today) {
    // Locked: either you already trained today, or it's the weekly rest day.
    const previous = passes[state.index - 1];
    const restDay = !finishedToday && previous && previous.restAfter;
    return { ...base, status: restDay ? 'rest' : 'locked', pass, opensOn: state.openedOn, finishedToday };
  }

  const progress = passProgress(pass, runsSince(runs, state.openedOn), playlists, deloadVolume);
  return {
    ...base,
    status: 'active',
    pass,
    progress,
    openedOn: state.openedOn,
    // How long the pass has waited for you (for a "welcome back" note).
    daysWaiting: progress.lastPlayedAt ? 0 : daysBetween(state.openedOn, today),
  };
}

module.exports = { startState, advance, markDone, followView, addDays };
