// weryfikacja workera po pushu 480 — plik zamiast one-linerów (bramka blokuje pipe/one-linery)
const r = await fetch('https://cosmiclands-sync.flufy69happy.workers.dev/api/map');
const d = await r.json();
const plots = d.plots || [];
const cnt = {}; for (const p of plots) cnt[p.planet] = (cnt[p.planet] || 0) + 1;
const st = {}; for (const p of plots) st[p.sale_status] = (st[p.sale_status] || 0) + 1;
console.log('HTTP', r.status, '| source:', d.source, '| plots:', plots.length);
console.log('per planeta:', JSON.stringify(cnt));
console.log('sale_status:', JSON.stringify(st));
