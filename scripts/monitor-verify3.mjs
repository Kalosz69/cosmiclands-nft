import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const DOMAIN = 'rzkhvb-m1.myshopify.com';
const r = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({client_id: id, client_secret: secret, grant_type: 'client_credentials'}),
});
const TOKEN = (await r.json()).access_token;
const gql = async (q) => (await (await fetch(`https://${DOMAIN}/admin/api/2026-07/graphql.json`, {
  method: 'POST', headers: {'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
  body: JSON.stringify({query:q}),
})).json());

const HANDLES = ['mars-plot-000007','mars-plot-003696','jupiter-plot-004127','neptune-plot-002403'];
for (const h of HANDLES) {
  const j = await gql(`query($h:String!){ productByHandle(handle:$h){ id metafields(first:30){nodes{namespace key value}} } }`, );
  // rebuild query with literal
  const j2 = await gql(`{ productByHandle(handle:"${h}"){ id metafields(first:30){nodes{namespace key value}} } }`);
  const p = j2?.data?.productByHandle;
  if (!p) { console.log(h, '=> ERR', JSON.stringify(j2?.errors ?? j2).slice(0,200)); continue; }
  const only = (p.metafields?.nodes ?? []).filter(m=>m.key==='sale_status'||m.key==='status');
  console.log(h, '=>', only.map(m=>`${m.key}=${m.value}`).join(' | ') || '(brak status mf)');
}