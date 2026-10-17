// Compares the settings in one run with the plan (data/config.json) and
// returns a list of Danish warnings. An empty list means the run looks fine.
const { horizontalFov } = require('./fov');

function aspectLabel(width, height) {
  if (!width || !height) return null;
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.01) return '16:9';
  if (Math.abs(ratio - 16 / 10) < 0.01) return '16:10';
  if (Math.abs(ratio - 4 / 3) < 0.01) return '4:3';
  return ratio.toFixed(2) + ':1';
}

function checkRunSettings(run, expected) {
  const warnings = [];

  if (run.sensScale !== expected.sens_scale) {
    warnings.push(`Sens-skala er ${run.sensScale || 'ukendt'}, planen siger ${expected.sens_scale}`);
  }
  if (run.sens !== expected.sens) {
    // The plan allows other sens on some Viscose scenarios, so say so.
    warnings.push(`Sens er ${run.sens ?? 'ukendt'}, planen siger ${expected.sens} (undtagen Viscose Fingertip/Wrist)`);
  }
  if (run.dpi !== expected.dpi) {
    warnings.push(`DPI er ${run.dpi ?? 'ukendt'}, planen siger ${expected.dpi}`);
  }

  const aspect = aspectLabel(run.width, run.height);
  if (aspect !== expected.aspect_ratio) {
    warnings.push(`Opløsning ${run.resolution || 'ukendt'} er ${aspect || 'ukendt'}, planen siger ${expected.aspect_ratio}`);
  }

  const horizontal = horizontalFov(run.fov, run.fovScale, run.width, run.height);
  if (horizontal === null) {
    warnings.push(`Kan ikke beregne horisontal FOV (FOV ${run.fov ?? '?'}, FOVScale ${run.fovScale || '?'})`);
  } else if (horizontal < expected.min_horizontal_fov_for_benchmarks - 0.05) {
    warnings.push(
      `Horisontal FOV er kun ${horizontal.toFixed(1)}°, benchmarks kræver mindst ${expected.min_horizontal_fov_for_benchmarks}°. Scoren er ikke gyldig til Voltaic/Viscose`
    );
  }

  return { horizontalFov: horizontal, warnings };
}

module.exports = { checkRunSettings, aspectLabel };
