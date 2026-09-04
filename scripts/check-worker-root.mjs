// check-worker-root.mjs — weryfikacja root endpoint workera (format {handle:status})
// Używany przez cl-pipeline-monitor (cron ffe8bd03b58b). Read-only.
const r = await fetch('https://cosmiclands-sync.flufy69happy.workers.dev/');
const code = r.status;
const d = await r.json();
const handles = Object.keys(d);
const values = new Set(Object.values(d));
console.log(`HTTP ${code} | handles: ${handles.length} | statuses: ${[...values].join(',')}`);
console.log(`sample: ${handles[0]} → ${d[handles[0]]}`);
if (code !== 200 || handles.length === 0) { console.error('ALARM: root endpoint nieprawidłowy'); process.exit(1); }
