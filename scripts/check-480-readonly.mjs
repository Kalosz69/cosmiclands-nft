// READ-ONLY check: stan 480 w żywym Shopify (nie wierzę raportom, sprawdzam sam)
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const DOMAIN = 'rzkhvb-m1.myshopify.com';
const r = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({client_id: id, client_secret: secret, grant_type: 'client_credentials'}),
});
if (!r.ok) { console.log('OAUTH FAIL', r.status, (await r.text()).slice(0,200)); process.exit(1); }
const TOKEN = (await r.json()).access_token;
const gql = async (q, v={}) => {
  const res = await fetch(`https://${DOMAIN}/admin/api/2026-07/graphql.json`, {
    method: 'POST', headers: {'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
    body: JSON.stringify({query:q, variables:v}),
  });
  if (res.status === 429) { await new Promise(s=>setTimeout(s,3000)); return gql(q,v); }
  return res.json();
};
const c480 = await gql(`{ productsCount(query:"tag:new-480") { count } }`);
const cAll = await gql(`{ productsCount(query:"") { count } }`);
console.log('count tag:new-480 =', c480.data?.productsCount?.count ?? JSON.stringify(c480));
console.log('count ALL =', cAll.data?.productsCount?.count ?? JSON.stringify(cAll));
const KANON = { mercury:2036, venus:2041, mars:2046, jupiter:2051, saturn:2056, uranus:2061, neptune:2066, pluto:2126 };
for (const planet of Object.keys(KANON)) {
  const h = `${planet}-plot-10001`;
  const res = await gql(`query($h:String!){ productByHandle(handle:$h){ id status metafields(first:30){nodes{key value}} variants(first:1){nodes{sku}} } }`, {h});
  const p = res.data?.productByHandle;
  if (!p) { console.log(h, '=> BRAK PRODUKTU'); continue; }
  const uy = p.metafields.nodes.find(n => n.key === 'unlock_year');
  const v = uy?.value ?? '(brak metafielda)';
  const ok = String(KANON[planet]) === String(uy?.value);
  console.log(`${h} | status=${p.status} | unlock_year=${v} | kanon=${KANON[planet]} | ${ok ? 'OK' : 'ZLE'}`);
}