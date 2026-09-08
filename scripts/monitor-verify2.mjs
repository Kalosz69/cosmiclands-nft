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

const HANDLES = ['mars-plot-003696','jupiter-plot-004127','jupiter-plot-004311','saturn-plot-004311','saturn-plot-007325','mercury-plot-003327','mercury-plot-005541','neptune-plot-002403','neptune-plot-005972'];
let qs = {};
HANDLES.forEach((h,i)=> qs['x'+i] = `productByHandle(handle:"${h}"){ id metafields(first:4){nodes{namespace key value}} }`);
const q = `query{ ${Object.entries(qs).map(([k,v])=>`${k}:${v}`).join(' ')} }`;
const j = await gql(q);
for (const [k,v] of Object.entries(j?.data ?? {})) {
  const mfs = (v?.metafields?.nodes ?? []).map(m=>`${m.namespace}.${m.key}=${m.value}`).join(' | ');
  console.log(`${HANDLES[+k.slice(1)]}: ${mfs || 'NO MF'}`);
}
// orders containing these plots?
const oq = `{ orders(first:10, sortKey:CREATED_AT, reverse:true){ edges { node { id name createdAt displayFinancialStatus lineItems(first:5){ edges { node { product { handle } } } } } } } }`;
const oj = await gql(oq);
let nOrd = 0;
for (const e of (oj?.data?.orders?.edges ?? [])) {
  const handles = (e.node.lineItems.edges||[]).map(x=>x.node.product?.handle).filter(Boolean);
  const hit = handles.filter(h=>HANDLES.includes(h) || h==='mars-plot-000010' || h==='venus-plot-001233');
  if (hit.length) {
    nOrd++;
    console.log(`ORDER ${e.node.name} ${e.node.createdAt} ${e.node.displayFinancialStatus}: ${hit.join(',')}`);
  }
}
console.log('orders z sold-handle w ostatnich 10:', nOrd);