// push-kv-8368.mjs — wypchnięcie manifestu 8368 do live KV (wzorzec restore-kv-426.mjs).
// 1) backup obecnego manifestu  2) PUT 8368  3) read-back + sanity (unikalność, per planeta, sold zachowane).
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN = t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';
const NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
const SRC = 'build/kv-manifest-8368.json';

const manifest = JSON.parse(fs.readFileSync(SRC,'utf8'));
if (!Array.isArray(manifest) || manifest.length !== 8368) throw new Error(`manifest ma ${manifest.length}, oczekiwano 8368`);
const api = (path, opts={}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`, {
  ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type':'application/json', ...(opts.headers||{}) },
});

// 1) backup obecnego
const old = await api('/values/manifest');
if (!old.ok) throw new Error(`read manifest fail: ${old.status}`);
const oldJson = await old.text();
const oldCount = JSON.parse(oldJson).length;
const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
fs.writeFileSync(`build/manifest-kv-backup-${ts}.json`, oldJson);
console.log(`backup obecnego: build/manifest-kv-backup-${ts}.json (${oldCount})`);

// 2) PUT 8368
const put = await api('/values/manifest', {method:'PUT', body: JSON.stringify(manifest)});
if (put.status !== 200) throw new Error(`PUT manifest fail: ${put.status} ${await put.text()}`);
console.log('PUT manifest 8368 → 200 OK');

// 3) read-back (jedyne źródło prawdy)
const rb = await api('/values/manifest');
const rbJson = JSON.parse(await rb.text());
console.log(`read-back: ${rbJson.length} rekordów`);
if (rbJson.length !== 8368) throw new Error(`read-back ${rbJson.length} ≠ 8368`);
const byPlanet = {};
for (const p of rbJson) byPlanet[p.mf_planet||p.planet] = (byPlanet[p.mf_planet||p.planet]||0)+1;
console.log('per planeta:', JSON.stringify(byPlanet));
const handles = new Set(); let dup = 0;
for (const p of rbJson) { if (handles.has(p.handle)) dup++; handles.add(p.handle); }
const sold = rbJson.filter(p => p.mf_sale_status !== 'available').length;
const has1 = rbJson.some(p => p.handle === 'mars-plot-000001');
const has351 = rbJson.some(p => p.handle === 'mars-plot-002351');
const hasVenus = rbJson.some(p => p.handle === 'venus-plot-000001');
console.log(`sanity: dup=${dup}, non-available=${sold}, mars-000001=${has1}, mars-002351=${has351} (FAIL-import w KV), venus-000001=${hasVenus}`);
if (dup) throw new Error('DUPLIKAT handle — rollback z backupu');
if (!has1 || !hasVenus || !has351) throw new Error('sanity handle nie przeszedł');
console.log('PUSH KV 8368 OK — mapa pokaże 8004 Mars + 364 stare; rollback: build/manifest-kv-backup-'+ts+'.json');
