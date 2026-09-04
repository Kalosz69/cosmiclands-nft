// READ-ONLY: szukam duplikatów metafieldów na próbce
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
const res = await gql(`query($h:String!){ productByHandle(handle:$h){ metafields(first:50){nodes{id namespace key value}} } }`, {h:'venus-plot-10001'});
const nodes = res.data.productByHandle.metafields.nodes;
console.log('WSZYSTKIE metafieldy venus-plot-10001:');
for (const n of nodes) console.log(` ${n.namespace}.${n.key} = ${n.value}  (${n.id})`);
const dup = nodes.filter(n=>n.key==='unlock_year');
console.log('unlock_year x', dup.length, dup.length>1 ? 'DUBLIKAT!' : '(OK)');