// PUSH-KV LINII K — naprawiony push manifestu do Cloudflare KV (bezpośrednio przez realne CF API).
// FIX vs push-kv-manifest-480.mjs (przeniesiony do _STARE-... 08.09): PUT /values/{key} zwraca HTTP 200 z PUSTYM body —
// stary skrypt robił put.json() → SyntaxError po UDANYM zapisie → read-back nigdy nie biegł.
// Teraz: sukces = status 200; read-back = jedyne źródło prawdy (długość + statusy).
// Usage: node push-kv-k.mjs build/kv-manifest-k10.json
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN = t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';
const NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
const FILE = process.argv[2];
if (!FILE) { console.log('usage: node push-kv-k.mjs <manifest.json>'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(FILE,'utf8'));
console.log(`push: ${FILE} → KV manifest (${manifest.length} rekordów)`);

const api = (path, opts={}) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`, {
  ...opts, headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type':'application/json', ...(opts.headers||{})},
});

// 1) backup starego manifestu (odwracalność)
const old = await api('/values/manifest');
if (!old.ok) throw new Error(`read manifest fail: ${old.status}`);
const oldJson = await old.text();
const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
fs.writeFileSync(`build/manifest-kv-backup-${ts}.json`, oldJson);
const oldCount = JSON.parse(oldJson).length;
console.log(`backup starego: build/manifest-kv-backup-${ts}.json (${oldCount} rekordów)`);

// 2) PUT — FIXED: status 200 zamiast .json() na pustym body
const put = await api('/values/manifest', {method:'PUT', body: JSON.stringify(manifest)});
if (put.status !== 200) throw new Error(`PUT fail: HTTP ${put.status} ${await put.text().then(x=>x.slice(0,200))}`);
console.log(`PUT: HTTP 200 OK (${manifest.length} rekordów)`);

// 3) read-back = dowód
const rb = await api('/values/manifest');
const rbJson = await rb.json();
if (!Array.isArray(rbJson) || rbJson.length !== manifest.length) throw new Error(`READBACK FAIL: ${rbJson?.length}`);
const av = rbJson.filter(p=>p.mf_sale_status==='available').length;
console.log(`READBACK: ${rbJson.length} rekordów, available=${av}, sample=${rbJson[0].handle}/${rbJson[0].mf_sale_status}/${rbJson[0].image_src.slice(0,50)}`);
console.log('KV PUSH ZAKOŃCZONY');
