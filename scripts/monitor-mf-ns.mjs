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
const H = ['mars-plot-000007','mars-plot-000010','venus-plot-001233','jupiter-plot-004127'];
const q = `{ a:productByHandle(handle:"${H[0]}"){ id metafields(first:20){nodes{namespace key value}}} b:productByHandle(handle:"${H[2]}"){ id metafields(first:20){nodes{namespace key value}}} }`;
const j = await gql(q);
for (const k of ['a','b']) {
  const p = j.data?.[k];
  console.log(k, p?.id?.slice(-8));
  (p?.metafields?.nodes ?? []).forEach(m=>console.log('   ', m.namespace+'.'+m.key, '=', m.value?.slice(0,60)));
}
