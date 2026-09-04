// FAZA 4 — PUSH-KV: wgranie build/catalog960-canonical-manifest.json do KV NS SHOPIFY_KV (key: manifest).
// Backup starego manifestu -> build/manifest-kv-backup-<ts>.json przed nadpisaniem.
// UWAGA: map_cache key zostaje nietknięty (worker sam go odświeży po TTL 360s).
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN = t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';
const NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
const manifest = JSON.parse(fs.readFileSync('build/catalog960-canonical-manifest.json','utf8'));
if (manifest.length !== 960) throw new Error(`manifest ma ${manifest.length}, oczekiwano 960`);

const api = (path, opts={}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`, {
  ...opts, headers: {Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json', ...(opts.headers||{})},
});

// 1) backup starego manifestu
const old = await api('/values/manifest');
if (!old.ok) throw new Error(`read manifest fail: ${old.status}`);
const oldJson = await old.text();
const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
fs.writeFileSync(`build/manifest-kv-backup-${ts}.json`, oldJson);
const oldCount = JSON.parse(oldJson).length;
console.log(`backup starego manifestu: build/manifest-kv-backup-${ts}.json (${oldJson.length} znaków)`);

// 2) push nowego (PUT values/manifest)
const put = await api('/values/manifest', {method:'PUT', body: JSON.stringify(manifest)});
const putRes = await put.json();
if (!put.success) throw new Error('PUT manifest FAIL: '+JSON.stringify(put.errors));
console.log('PUT manifest: OK (960 rekordów)');

// 3) readback weryfikacja
const rb = await api('/values/manifest');
const rbJson = await rb.json();
if (!Array.isArray(rbJson) || rbJson.length !== 960) throw new Error(`READBACK FAIL: ${rbJson?.length}`);
const sold = rbJson.filter(p=>p.mf_sale_status!=='available').length;
console.log(`READBACK: ${rbJson.length} rekordów, non-available=${sold}, sample=${rbJson[0].handle}/${rbJson[0].mf_sale_status}`);
console.log('KV PUSH ZAKOŃCZONY');