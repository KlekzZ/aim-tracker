// Works out cm/360: how far you move the mouse for a full turn in game.
// It's the one number that lets you compare sens across games and scales.
//
// Each KovaaK's "Sens Scale" turns the camera a fixed number of degrees per
// mouse count at sens 1 (the "yaw"). Then:
//   degrees per count = yaw * sens
//   counts per 360    = 360 / degrees per count
//   cm per 360        = counts / DPI * 2.54
// Example: CSGO yaw 0.022, sens 0.85, 800 DPI -> 61.1 cm/360.

const YAW = {
  csgo: 0.022,
  source: 0.022,
  quake: 0.022,
  apex: 0.022,
  'quake/source': 0.022,
  overwatch: 0.0066,
  valorant: 0.07,
  rainbow6: 0.00572958,
};

const INCH_CM = 2.54;

// Returns cm/360 rounded to 1 decimal, or null if it can't be worked out.
// We return null instead of guessing for scales we don't know.
function cmPer360(sens, sensScale, dpi) {
  if (!sens || !dpi || !sensScale) return null;
  const scale = sensScale.trim().toLowerCase();

  // Some scales store the cm or inches per 360 directly as the "sens".
  if (scale === 'cm/360') return round1(sens);
  if (scale === 'in/360' || scale === 'inches/360') return round1(sens * INCH_CM);

  const yaw = YAW[scale];
  if (!yaw) return null;
  const countsPer360 = 360 / (yaw * sens);
  return round1((countsPer360 / dpi) * INCH_CM);
}

const round1 = (n) => Math.round(n * 10) / 10;

// The other way round: which in-game sens gives this cm/360 with your scale
// and DPI. Rounded to 2 decimals, which is what you type into KovaaK's.
function sensForCm(cm, sensScale, dpi) {
  if (!cm || !dpi || !sensScale) return null;
  const scale = sensScale.trim().toLowerCase();
  if (scale === 'cm/360') return round1(cm);
  if (scale === 'in/360' || scale === 'inches/360') return Math.round((cm / INCH_CM) * 100) / 100;
  const yaw = YAW[scale];
  if (!yaw) return null;
  return Math.round(((360 * INCH_CM) / (yaw * dpi * cm)) * 100) / 100;
}

module.exports = { cmPer360, sensForCm };
