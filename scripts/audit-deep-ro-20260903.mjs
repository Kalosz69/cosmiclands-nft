// AUDYT DEEP read-only 2026-09-03 v2 (po incydencie nocnej sesji) — ZERO mutacji.
// Każdy fakt = pomiar live. Porównanie live-vs-kanon po POLACH (price/sale_status/class/planet).
import fs from 'node:fs';

const SHOP = 'rzkhvb-m1.myshopify.com';
const CANON = '/opt/data/workspace/cosmiclands-nft/build/catalog960-canonical-manifest.json';

// --- auth ---
const txt = fs.readFileSync('/opt/data/.secrets/shop.txt', 'utf8');
const kb = fs.readFileSync('/opt/data/workspace/cosmiclands-knowledge/17-indeks-sekretow-endpointow.md', 'utf8');
const ids = [...new Set([...(txt.match(/\b[0-9a-f]{32}\b/g) || []), ...((kb.match(/`[0-9a-f]{32}`/g) || []).map(s => s.slice(1, -1)))])];
const secs = [...new Set([...(txt.match(/shpss_[A-Za-z0-9]+/g) || []), ...((kb.match(/shpss_[A-Za-z0-9]+/g) || []))])];
let access_token = null;
for (const id of ids) {
  for (const s of secs) {
    try {
      const tok = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id, client_secret: s, grant_type: 'client_credentials' }),
      });
      if (tok.ok) { access_token = (await tok.json()).access_token; break; }
    } catch {}
  }
  if (access_token) break;
}
if (!access_token) { console.log('SHOP AUTH: FAIL'); process.exit(1); }
console.log('SHOP AUTH: OK');

const gql = async (query, variables = {}) => {
  const r = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
};

// --- 1. Cały sklep + per planeta (tag = nazwa planety, wg kanonu) ---
const all = await gql(`{ productsCount(query:""){count} }`);
console.log(`\n[1] WSZYSTKIE produkty w sklepie: ${all?.data?.productsCount?.count}`);
const PLANETS = ['mars', 'venus', 'jupiter', 'saturn', 'mercury', 'uranus', 'neptune', 'pluto'];
const alias = Object.fromEntries(PLANETS.map((p, i) => [`p${i}`, `productsCount(query:"tag:${p}"){count}`]));
const pc = await gql(`{ ${Object.entries(alias).map(([k, v]) => `${k}:${v}`).join(' ')} }`);
const perPlanetLive = {};
for (const [k, v] of Object.entries(pc?.data ?? {})) perPlanetLive[PLANETS[+k.slice(1)]] = v.count;
console.log(`    per planeta (tag): ${JSON.stringify(perPlanetLive)}`);

// --- 2. Pełny skan 960: handle/price/class/sale_status/planet/SKU/inventory ---
const live = new Map();
let after = null, scanned = 0, missingMF = 0, badSku = [], invSum = 0;
do {
  const q = `query($after:String){
    products(first:250, after:$after, query:"status:active"){
      pageInfo{hasNextPage endCursor}
      edges{node{
        handle totalInventory
        priceRangeV2{minVariantPrice{amount}}
        variants(first:1){edges{node{sku inventoryQuantity}}}
        metafields(first:20){edges{node{key value}}}
      }}
    }
  }`;
  const res = await gql(q, { after });
  const conn = res?.data?.products;
  if (!conn) { console.log('GRAPHQL ERROR:', JSON.stringify(res.errors || res).slice(0, 300)); process.exit(1); }
  for (const { node: p } of conn.edges) {
    scanned++;
    const mf = {};
    for (const e of p.metafields?.edges ?? []) if (e.node?.key) mf[e.node.key] = e.node.value;
    const price = parseFloat(p.priceRangeV2?.minVariantPrice?.amount ?? -1);
    const sku = p.variants?.edges?.[0]?.node?.sku;
    invSum += p.variants?.edges?.[0]?.node?.inventoryQuantity ?? 0;
    if (!mf.plot_id || !mf.sale_status || !mf.class || !mf.planet) missingMF++;
    if (!sku || !/^[A-Z]+-PLOT-\d{6}$/.test(sku)) badSku.push(`${p.handle}:${sku}`);
    live.set(p.handle, { price, sale_status: mf.sale_status, class: mf.class, planet: mf.planet, plot_id: mf.plot_id, sku });
  }
  after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
} while (after);
console.log(`\n[2] Zeskanowano (status:active): ${scanned}`);
console.log(`    brakujące MF (plot_id/sale_status/class/planet): ${missingMF}`);
console.log(`    zły SKU: ${badSku.length}${badSku.length ? ' → ' + badSku.slice(0, 5).join(', ') : ''}`);
console.log(`    inventory sum: ${invSum}`);

// --- 3. DRIFT live vs kanon (per plot) ---
const canon = JSON.parse(fs.readFileSync(CANON, 'utf8'));
const canonMap = new Map(canon.map(c => [c.handle, c]));
let inBoth = 0, onlyLive = [], onlyCanon = [], priceDiff = [], statusDiff = [], classDiff = [], planetDiff = [];
for (const [h, l] of live) {
  const c = canonMap.get(h);
  if (!c) { onlyLive.push(h); continue; }
  inBoth++;
  if (Math.abs(l.price - c.price) > 0.001) priceDiff.push(`${h}: live=${l.price} kanon=${c.price}`);
  if (l.sale_status !== c.sale_status) statusDiff.push(`${h}: live=${l.sale_status} kanon=${c.sale_status}`);
  if (l.class !== c.class) classDiff.push(`${h}: live=${l.class} kanon=${c.class}`);
  if (l.planet !== c.planet) planetDiff.push(`${h}: live=${l.planet} kanon=${c.planet}`);
}
for (const [h] of canonMap) if (!live.has(h)) onlyCanon.push(h);
const show = (a, n = 5) => a.length ? ` → ${a.slice(0, n).join(' | ')}${a.length > n ? ` (+${a.length - n})` : ''}` : '';
console.log(`\n[3] DRIFT live-vs-kanon (960): wspólnych=${inBoth}, tylko-live=${onlyLive.length}, tylko-kanon=${onlyCanon.length}`);
console.log(`    price: ${priceDiff.length}${show(priceDiff)}`);
console.log(`    sale_status: ${statusDiff.length}${show(statusDiff)}`);
console.log(`    class: ${classDiff.length}${show(classDiff)}`);
console.log(`    planet: ${planetDiff.length}${show(planetDiff)}`);

// --- 4. KV manifest (GET tylko) vs kanon ---
try {
  const cft = fs.readFileSync('/opt/data/.secrets/cloudflar.txt', 'utf8').match(/cfat_[A-Za-z0-9_-]+/)[0];
  const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';
  const NS = 'a465f1a1a19848dd9ef32974c88d3b6d';
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}/values/manifest`, { headers: { Authorization: `Bearer ${cft}` } });
  if (!r.ok) { console.log(`\n[4] KV manifest: HTTP ${r.status}`); }
  else {
    const kv = JSON.parse(await r.text());
    const kvMap = new Map(kv.map(p => [p.handle, p]));
    let kvDrift = 0; const kvSamp = [];
    for (const c of canon) {
      const k = kvMap.get(c.handle);
      if (!k) { kvDrift++; if (kvSamp.length < 3) kvSamp.push(`BRAK:${c.handle}`); continue; }
      if (String(k.mf_sale_status) !== String(c.sale_status)) { kvDrift++; if (kvSamp.length < 5) kvSamp.push(`${c.handle}: KV=${k.mf_sale_status} kanon=${c.sale_status}`); }
    }
    console.log(`\n[4] KV manifest: ${kv.length} rekordów, drift sale_status vs kanon: ${kvDrift}${kvDrift ? ' → ' + kvSamp.join(' | ') : ''}`);
  }
} catch (e) { console.log(`\n[4] KV: ERROR ${e.message}`); }

// --- 5. Tagi statusowe ---
const tg = await gql(`{ a:productsCount(query:"tag:available"){count} b:productsCount(query:"tag:reserved"){count} c:productsCount(query:"tag:locked"){count} }`);
console.log(`\n[5] tagi: available=${tg.data.a.count}, reserved=${tg.data.b.count}, locked=${tg.data.c.count} (kanon: 832/128)`);
console.log('\nAUDYT DEEP v2 ZAKOŃCZONY (read-only)');
