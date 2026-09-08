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
const gql = async (q) => {
  for (;;) {
    const res = await fetch(`https://${DOMAIN}/admin/api/2026-07/graphql.json`, {
      method: 'POST', headers: {'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
      body: JSON.stringify({query:q}),
    });
    if (res.status === 429) { await new Promise(s=>setTimeout(s,3000)); continue; }
    return res.json();
  }
};
const c480 = await gql(`{ productsCount(query:"tag:new-480") { count } }`);
const cAll = await gql(`{ productsCount(query:"") { count } }`);
console.log('tag:new-480 =', c480.data?.productsCount?.count ?? JSON.stringify(c480));
console.log('ALL =', cAll.data?.productsCount?.count ?? JSON.stringify(cAll));
// per-planeta status counts by handle prefix
const PLANETS = ['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'];
for (const p of PLANETS) {
  const q = `{ productsCount(query:"handle:${p}-plot-* AND status:active") { count } }`;
  const c = await gql(q);
  console.log(`${p}: active=${c.data?.productsCount?.count ?? JSON.stringify(c)}`);
}
