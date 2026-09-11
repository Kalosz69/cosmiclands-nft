#!/usr/bin/env node
// build-push-kv-all-lite.mjs — merge 8×(8000) manifestów → projekcja LIGHT_FIELDS (14 pól, jak worker) → KV manifest.
// Powód: pełny 64k = ~58 MiB > 25 MiB (limit wartości CF KV). Lite = ~23 MiB → mieści się.
// Użycie: node scripts/build-push-kv-all-lite.mjs [--no-push]
// LIGHT_FIELDS = dokładnie te, które worker /api/map?light=1 zwraca frontowi mapy.
import fs from 'node:fs';

const NOPUSH = process.argv.includes('--no-push');
const PLANETS = ['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'];
const LIGHT_FIELDS = ["plot_id","plot_number","handle","mf_planet","mf_region_id","mf_region_name","mf_class","mf_sale_status","lat","lon","price","mf_cosmo_tokens","mf_area_ha","image_src"];
const KV_MAX = 25 * 1024 * 1024; // 25 MiB limit wartości CF KV

const merged = [];
for (const pl of PLANETS) {
  const f = `build/${pl}-8000-manifest.json`;
  if (!fs.existsSync(f)) { console.error('Brak', f); process.exit(1); }
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (m.length < 8000) { console.error(`${pl}: ${m.length} < 8000`); process.exit(1); }
  for (const p of m) { const o = {}; for (const k of LIGHT_FIELDS) if (p[k] !== undefined) o[k] = p[k]; o.__planet_missing = p.mf_planet === undefined; merged.push(o); }
  console.log(`${pl}: ${m.length}`);
}
console.log('TOTAL:', merged.length);

// sanity: brak rekordów bez mf_planet (klucz filtrowania mapy)
const noPlanet = merged.filter(o => o.__planet_missing).length;
for (const o of merged) delete o.__planet_missing;
console.log('rekordy bez mf_planet:', noPlanet);

// unikalność handle
const hs = new Set(); let dup = 0;
for (const p of merged) { if (hs.has(p.handle)) dup++; hs.add(p.handle); }
console.log('duplikaty handle:', dup);
if (dup) { console.error('FATAL duplikaty'); process.exit(1); }

// sold override — statusy sprzedane: sklep (inv=0) + stara KV (webhook) + manifesty
const soldFile = 'build/kv-sold-override.json';
if (fs.existsSync(soldFile)) {
  const soldSet = new Set(JSON.parse(fs.readFileSync(soldFile, 'utf8')));
  let n = 0;
  for (const r of merged) { if (soldSet.has(r.handle)) { if (r.mf_sale_status !== 'sold') { r.mf_sale_status = 'sold'; n++; } } }
  const found = merged.filter(r => soldSet.has(r.handle)).length;
  console.log(`sold override: ${n} ustawione na sold (lista=${soldSet.size}, dopasowane=${found}, brakujące=${soldSet.size - found})`);
  if (found < soldSet.size) console.warn('UWAGA: część handle z override nie istnieje w manifeście');
}

const out = JSON.stringify(merged);
fs.writeFileSync('build/kv-manifest-all-lite.json', out);
console.log('rozmiar:', out.length, 'bajtów =', (out.length/1048576).toFixed(2), 'MiB / limit', (KV_MAX/1048576), 'MiB');
if (out.length > KV_MAX) { console.error('FATAL: przekracza limit KV 25 MiB'); process.exit(1); }
console.log('MIESCI SIE w limicie KV (zapas', ((KV_MAX-out.length)/1048576).toFixed(2), 'MiB)');

if (NOPUSH) { console.log('--no-push: nie pushuję'); process.exit(0); }

const t = fs.readFileSync('/opt/data/.secrets/cloudflar.txt', 'utf8');
const TOKEN = t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf', NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
const api = (path, opts={}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, ...(opts.headers||{}) } });
const old = await api('/values/manifest'); const oldText = await old.text();
let oldCount = 0; try { oldCount = JSON.parse(oldText).length; } catch {}
const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
fs.writeFileSync(`build/manifest-kv-backup-${ts}.json`, oldText);
console.log(`backup: manifest-kv-backup-${ts}.json (${oldCount})`);
const put = await api('/values/manifest', { method: 'PUT', body: out });
if (put.status !== 200) throw new Error(`PUT fail ${put.status} ${await put.text()}`);
console.log('PUT', merged.length, '→ 200');
const rb = JSON.parse(await (await api('/values/manifest')).text());
console.log('read-back:', rb.length);
const by = {}; for (const p of rb) { const pl = p.mf_planet; by[pl] = (by[pl]||0)+1; }
console.log('per planeta:', JSON.stringify(by));
console.log('PUSH KV LITE OK');
