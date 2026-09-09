// build-kv-8368.mjs — manifest KV: 8004 Mars (mars-8000-manifest.json, kanon-obrazki fix-images)
// + 364 stare non-Mars z LIVE KV (zachowane pola i mf_sale_status=sold). Unikalność handle.
// Wynik: build/kv-manifest-8368.json. ZERO zapisów do CF (tylko GET manifestu).
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN = t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';
const NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
const api = (path, opts={}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`, {
  ...opts, headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers||{}) },
});

// 1) live KV (364 non-Mars + sold states)
const r = await api('/values/manifest');
if (!r.ok) throw new Error(`live read fail: HTTP ${r.status}`);
const live = await r.json();
const nonMars = live.filter(p => (p.mf_planet||p.planet) !== 'mars');
const soldCount = live.filter(p => p.mf_sale_status !== 'available').length;
console.log(`LIVE KV: ${live.length} | non-Mars: ${nonMars.length} | non-available: ${soldCount}`);
if (nonMars.length !== 364) throw new Error(`oczekiwano 364 non-Mars, jest ${nonMars.length}`);

// 2) nowe Mars 8004
const mars = JSON.parse(fs.readFileSync('build/mars-8000-manifest.json','utf8'));
console.log(`mars-8000-manifest: ${mars.length}`);
if (mars.length !== 8004) throw new Error(`oczekiwano 8004, jest ${mars.length}`);

// 3) unikalność handle
const handles = new Set(); let dup = 0;
for (const p of [...mars, ...nonMars]) { if (handles.has(p.handle)) { dup++; console.error('DUP:', p.handle); } handles.add(p.handle); }
if (dup) throw new Error(`${dup} duplikatów handle — STOP`);

const merged = [...mars, ...nonMars];
const byPlanet = {};
for (const p of merged) byPlanet[p.mf_planet||p.planet] = (byPlanet[p.mf_planet||p.planet]||0)+1;
if (merged.length !== 8368) throw new Error(`merged ${merged.length} ≠ 8368`);
fs.writeFileSync('build/kv-manifest-8368.json', JSON.stringify(merged));
console.log('per planeta:', JSON.stringify(byPlanet));
console.log(`ZAPISANO build/kv-manifest-8368.json (${merged.length}) — gotowe do pushu`);
