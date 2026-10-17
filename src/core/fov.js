// Works out the real horizontal FOV on screen from KovaaK's FOV settings.
//
// KovaaK's "FOVScale" says how the FOV number should be read. "CSGO" means
// "horizontal FOV on a 4:3 screen", "Overwatch" means "horizontal FOV on a
// 16:9 screen". On another screen shape the game keeps the vertical FOV and
// widens or narrows the horizontal one. So FOV 103 Overwatch is 103 on 16:9,
// but only about 86.6 on 4:3. Voltaic and Viscose need at least 103.

// The screen shape each scale is defined against. "vertical" means the
// number is already the vertical FOV. Unknown scales return null, and the
// app then says it can't check instead of guessing.
const SCALE_BASE = {
  overwatch: 16 / 9,
  valorant: 16 / 9,
  csgo: 4 / 3,
  source: 4 / 3,
  quake: 4 / 3,
  apex: 4 / 3,
  vertical: 'vertical',
  rainbow6: 'vertical',
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

function horizontalFov(fov, fovScale, width, height) {
  if (!fov || !fovScale || !width || !height) return null;
  const base = SCALE_BASE[fovScale.toLowerCase()];
  if (base === undefined) return null;

  const screenAspect = width / height;
  // Step 1: turn the setting into a vertical FOV.
  const verticalHalf =
    base === 'vertical'
      ? toRadians(fov) / 2
      : Math.atan(Math.tan(toRadians(fov) / 2) / base);
  // Step 2: widen that vertical FOV to the actual screen shape.
  return toDegrees(2 * Math.atan(Math.tan(verticalHalf) * screenAspect));
}

module.exports = { horizontalFov };
