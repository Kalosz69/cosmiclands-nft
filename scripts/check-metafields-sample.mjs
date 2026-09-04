// READ-ONLY: ile metafieldów realnie mają produkty (nowe vs stare)
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:id, client_secret:secret, grant_type:'client_credentials'}),
});
const TOKEN = (await r.json()).access_token;
const gql = async (q,v={}) => (await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
  method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body: JSON.stringify({query:q,variables:v})
})).json();
for (const h of ['mercury-plot-10001','pluto-plot-10002','mars-plot-000001']) {
  const res = await gql(`query($h:String!){ productByHandle(handle:$h){ id metafields(first:50){nodes{namespace key value type}} } }`, {h});
  const p = res.data?.productByHandle;
  if (!p) { console.log(h, '=> BRAK'); continue; }
  console.log(`\n== ${h} (${p.id}) — metafieldów: ${p.metafields.nodes.length}`);
  for (const n of p.metafields.nodes) console.log(`   ${n.namespace}.${n.key} = ${n.value} [${n.type}]`);
}