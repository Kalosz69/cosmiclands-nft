// build-kv-k2.mjs — skład KV manifest: 10 rekordów ŻYWYCH (live CF read; źródło prawdy o sold 000007) + 416 K2 = 1674.
// Zero backupów-źródeł — live read. Walidacja: unikalność handle, per planeta, sold zachowany.
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN = t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';
const NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
const api = (path, opts={}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`, {
  ...opts, headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers||{}) },
});

const r = await api('/values/manifest');
if (!r.ok) throw new Error(`live read fail: HTTP ${r.status}`);
const live = await r.json();
console.log(`LIVE KV: ${live.length} rekordów`);
const sold = live.find(p => p.handle === 'mars-plot-000007');
console.log(`sold check: 000007 mf_sale_status=${sold?.mf_sale_status} (schemat: ${Object.keys(sold||{}).length} pól)`);
if (sold?.mf_sale_status !== 'sold') { console.error('FATAL: 000007 nie jest sold w żywym KV — STOP'); process.exit(1); }

const k2 = JSON.parse(fs.readFileSync('build/k2-manifest.json','utf8'));
const merged = [...live, ...k2];

// walidacja
const handles = new Set(); let dup = 0;
for (const p of merged) { if (handles.has(p.handle)) dup++; handles.add(p.handle); }
const perPlanet = {};
for (const p of merged) perPlanet[p.mf_planet || p.planet] = (perPlanet[p.mf_planet || p.planet] || 0) + 1;
console.log(`merged: ${merged.length} | duplikaty: ${dup} | per planeta:`, JSON.stringify(perPlanet));
if (dup || merged.length !== 426) { console.error('FATAL: walidacja merged fail'); process.exit(1); }

fs.writeFileSync('build/kv-manifest-k2.json', JSON.stringify(merged, null, 1));
console.log(`ZAPISANO build/kv-manifest-k2.json (${merged.length}) — gotowe do push-kv-k.mjs`);
