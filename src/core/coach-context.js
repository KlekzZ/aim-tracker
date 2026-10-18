// Turns the app's already-computed data (the same object sent to the
// renderer) into a short Danish summary for the AI coach's prompt. Kept
// short on purpose: a long dump of every number would push real knowledge
// chunks out of the model's limited context window.
function buildStatsSummary(data) {
  const lines = [];

  const weakVoltaic = data.radar
    .filter((r) => r.current !== null)
    .sort((a, b) => a.current - b.current)
    .slice(0, 3);
  if (weakVoltaic.length) {
    lines.push('Svageste Voltaic-underkategorier (bedste scenarie, % af Platinum):');
    weakVoltaic.forEach((r) => lines.push(`- ${r.subcategory}: ${Math.round(r.current * 100)} %`));
  }

  const latest = data.latestRun;
  if (latest) {
    lines.push(`Seneste run: ${latest.scenario}, score ${latest.score}${latest.cm360 !== null ? `, ${latest.cm360} cm/360` : ''}.`);
  }

  const week = data.today && data.today.weekInfo;
  if (week && week.week !== null) {
    lines.push(`Uge ${week.week}${week.deload ? ' (deload-uge)' : ''} af planen. I dag: ${data.today.schedule}.`);
  }

  const lastLog = data.sessionLogs[0];
  if (lastLog) {
    lines.push(`Seneste log: spænding ${lastLog.tension}/5, smerte ${lastLog.pain}/10${lastLog.note ? `, note: "${lastLog.note}"` : ''}.`);
  }
  if (data.restWarning) {
    lines.push('OBS: smerte 5 eller mere i to sessioner i træk. Planens regel er hvil nu, ikke mere træning.');
  }

  return lines.length ? lines.join('\n') : 'Ingen data endnu.';
}

module.exports = { buildStatsSummary };
