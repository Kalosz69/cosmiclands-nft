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
const HANDLES = ['mars-plot-000007','mars-plot-000010','mars-plot-003696','venus-plot-001233','jupiter-plot-004127','mars-plot-000001'];
const q = `{ a:productByHandle(handle:"${HANDLES[0]}"){handle status metafields(first:10){nodes{key value namespace}}} b:productByHandle(handle:"${HANDLES[1]}"){handle status metafields(first:10){nodes{key value}}} c:productByHandle(handle:"${HANDLES[2]}"){handle status metafields(first:10){nodes{key value}}} d:productByHandle(handle:"${HANDLES[3]}"){handle status metafields(first:10){nodes{key value}}} e:productByHandle(handle:"${HANDLES[4]}"){handle status metafields(first:10){nodes{key value}}} f:productByHandle(handle:"${HANDLES[5]}"){handle status metafields(first:10){nodes{key value}}} }`;
const j = await gql(q);
for (const [k,v] of Object.entries(j?.data ?? {})) {
  const ss = v?.metafields?.nodes?.find(n=>n.key==='sale_status')?.value ?? 'BRAK';
  console.log(`${v?.handle ?? k}: status=${v?.status} sale_status=${ss}`);
}