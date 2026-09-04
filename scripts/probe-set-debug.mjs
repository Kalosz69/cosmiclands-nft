// DEBUG probe: pełny JSON odpowiedzi productSet z id + ponowny odczyt metafielda
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
const gql = async (q, v={}) => {
  const res = await fetch(`https://${DOMAIN}/admin/api/2026-07/graphql.json`, {
    method: 'POST', headers: {'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
    body: JSON.stringify({query:q, variables:v}),
  });
  return res.json();
};
const H = 'venus-plot-10001';
const lk = await gql(`query($h:String!){ productByHandle(handle:$h){ id metafields(first:30){nodes{id namespace key value type}} } }`, {h: H});
const p = lk.data.productByHandle;
console.log('PRODUCT ID:', p.id);
console.log('METAFIELD unlock_year NODE:', JSON.stringify(p.metafields.nodes.find(n=>n.key==='unlock_year')));
const mfid = p.metafields.nodes.find(n=>n.key==='unlock_year')?.id;
const input = { id: p.id, metafields: [
  { id: mfid, value: '2041' },  // wariant A: update po id metafielda
] };
const res = await gql(`mutation($input: ProductSetInput!){ productSet(input:$input){ product{id handle} userErrors{field message} } }`, {input});
console.log('productSet RESPONSE:', JSON.stringify(res, null, 1));
const after = await gql(`query($h:String!){ productByHandle(handle:$h){ metafields(first:30){nodes{key value}} } }`, {h: H});
console.log('AFTER: unlock_year =', after.data.productByHandle.metafields.nodes.find(n=>n.key==='unlock_year')?.value);