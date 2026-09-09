// restore-kv-426.mjs — przywrócenie manifestu KV do stanu zgodnego ze sklepem (426, K-line)
// GO K 08.09: "GO na przywrócenie KV do 426". Używa sprawdzonego wzorca push-kv-k.mjs.
// Kolejność: 1) backup obecnego (480) 2) PUT manifestu 426 3) read-back weryfikacja.
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN = t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';
const NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
const SRC = 'build/manifest-kv-backup-2026-09-07T20-29-46.json';

const manifest = JSON.parse(fs.readFileSync(SRC,'utf8'));
if (!Array.isArray(manifest) || manifest.length !== 426) throw new Error(`manifest ma ${manifest.length}, oczekiwano 426`);
const api = (path, opts={}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`, {
  ...opts, headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type':'application/json', ...(opts.headers||{})},
});

// 1) backup obecnego
const old = await api('/values/manifest');
if (!old.ok) throw new Error(`read manifest fail: ${old.status}`);
const oldJson = await old.text();
const oldCount = JSON.parse(oldJson).length;
const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
fs.writeFileSync(`build/manifest-kv-backup-${ts}.json`, oldJson);
console.log(`backup obecnego: build/manifest-kv-backup-${ts}.json (${oldCount})`);

// 2) PUT 426
const put = await api('/values/manifest', {method:'PUT', body: JSON.stringify(manifest)});
if (put.status !== 200) throw new Error(`PUT manifest fail: ${put.status} ${await put.text()}`);
console.log('PUT manifest 426 → 200 OK');

// 3) read-back (jedyne źródło prawdy)
const rb = await api('/values/manifest');
const rbJson = JSON.parse(await rb.text());
console.log(`read-back: ${rbJson.length} rekordów`);
if (rbJson.length !== 426) throw new Error(`read-back ${rbJson.length} ≠ 426`);
const byPlanet = {};
for (const p of rbJson) byPlanet[p.mf_planet||p.planet] = (byPlanet[p.mf_planet||p.planet]||0)+1;
console.log('read-back per planeta:', JSON.stringify(byPlanet));
// sanity: handle mars-plot-000034 NIE powinien istnieć (to nie był w sklepie), a 000001 TAK
const has1 = rbJson.some(p => p.handle === 'mars-plot-000001');
const has34 = rbJson.some(p => p.handle === 'mars-plot-000034');
console.log(`sanity: mars-plot-000001=${has1} (oczek. true), mars-plot-000034=${has34} (oczek. false)`);
if (!has1 || has34) throw new Error('sanity check nie przeszedł — sprawdź manifest');
console.log('RESTORE OK — KV zgodny ze sklepem (426)');
