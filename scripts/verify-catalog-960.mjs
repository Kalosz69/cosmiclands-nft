// TEST DEFINITYWNY A — pełna weryfikacja 960 w Shopify vs manifest (read-only).
// Pobiera WSZYSTKIE produkty z pełnymi metafieldami plot.* i porówna pole-po-polu.
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:id, client_secret:secret, grant_type:'client_credentials'}),
});
const TOKEN = (await r.json()).access_token;
const gql = async (q,v={}) => {
  for (;;) {
    const res = await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
      method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body: JSON.stringify({query:q,variables:v})
    });
    if (res.status===429){ await new Promise(s=>setTimeout(s,3000)); continue; }
    return res.json();
  }
};
const MF_KEYS = ['plot_id','planet','region','class','area_ha','price_eur','coordinates_lat','coordinates_lon','cosmo_tokens','status','sale_status','product_status','unlock_year'];
const live = []; let cursor = null;
for (;;) {
  const res = await gql(`query($c:String){ products(first:50, after:$c){ nodes{ id handle status tags variants(first:1){nodes{sku price}} metafields(first:30, namespace:"plot"){nodes{key value}} } pageInfo{ hasNextPage endCursor } } }`, {c:cursor});
  if (!res?.data?.products) { console.log('FAIL LIST:', JSON.stringify(res).slice(0,300)); process.exit(1); }
  live.push(...res.data.products.nodes);
  process.stdout.write(`\rpobrano: ${live.length}`);
  if (!res.data.products.pageInfo.hasNextPage) break;
  cursor = res.data.products.pageInfo.endCursor;
}
console.log();
const PLOT = JSON.parse(fs.readFileSync('build/catalog960-manifest.json','utf8'));
const exp = new Map(PLOT.map(p=>[p.handle,p]));
const liveMap = new Map(live.map(p=>[p.handle,p]));
const problems = [];
// a) liczby
console.log(`live produkty: ${live.length} | oczekiwane: 960`);
if (live.length !== 960) problems.push(`LICZBA: ${live.length} != 960`);
// nadmiarowe / brakujące
for (const h of liveMap.keys()) if (!exp.has(h)) problems.push(`NADMIAROWY: ${h}`);
for (const h of exp.keys()) if (!liveMap.has(h)) problems.push(`BRAK: ${h}`);
// pełne porównanie pól
let checked = 0;
for (const [h,e] of exp) {
  const l = liveMap.get(h); if (!l) continue;
  const mf = Object.fromEntries(l.metafields.nodes.map(n=>[n.key,n.value]));
  const chk = (name, expected, got) => { checked++; if (String(expected)!==String(got)) problems.push(`${h}: ${name} oczekiwane=${expected} gotowe=${got}`); };
  chk('status', 'ACTIVE', l.status);
  if (l.variants.nodes[0]) { chk('sku', e.sku, l.variants.nodes[0].sku); chk('price', e.price, l.variants.nodes[0].price); } else problems.push(`${h}: BRAK WARIANTU`);
  chk('mf_plot_id', e.mf_plot_id, mf['plot_id']); chk('mf_planet', e.mf_planet, mf['planet']);
  chk('mf_region', e.mf_region, mf['region']); chk('mf_region_id', e.mf_region_id, mf['region_id']);
  chk('mf_region_name', e.mf_region_name, mf['region_name']); chk('mf_class', e.mf_class, mf['class']);
  chk('mf_area_ha', e.mf_area_ha, mf['area_ha']); chk('mf_price_eur', e.mf_price_eur, mf['price_eur']);
  chk('mf_coordinates_lat', e.mf_coordinates_lat, mf['coordinates_lat']); chk('mf_coordinates_lon', e.mf_coordinates_lon, mf['coordinates_lon']);
  chk('mf_cosmo_tokens', e.mf_cosmo_tokens, mf['cosmo_tokens']); chk('mf_status', e.mf_status, mf['status']);
  chk('mf_sale_status', e.mf_sale_status, mf['sale_status']); chk('mf_product_status', e.mf_product_status, mf['product_status']);
  chk('mf_unlock_year', e.mf_unlock_year, mf['unlock_year']);
}
console.log(`pól sprawdzonych: ${checked}`);
if (problems.length) {
  console.log(`\nPROBLEMY (${problems.length}):`);
  for (const p of problems.slice(0,40)) console.log(' -', p);
  if (problems.length>40) console.log(` ...+${problems.length-40} więcej`);
  fs.writeFileSync('build/verify960-problems.json', JSON.stringify(problems,null,1));
  console.log('zapisano build/verify960-problems.json');
  process.exit(2);
} else {
  console.log('\n✅ WERYFIKACJA 960/960: PEŁNA ZGODNOŚĆ (każdy produkt, każde pole)');
}