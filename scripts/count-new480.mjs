// Ile produktów new-480 jest w Shopify + probierczyn rekord.
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)?.[0];
const id = t.match(/\b[0-9a-f]{32}\b/)?.[0];
const dom = 'rzkhvb-m1.myshopify.com';
const tok = await (await fetch(`https://${dom}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:id,client_secret:secret,grant_type:'client_credentials'})})).json();
const TOKEN = tok.access_token;
const g = async (q,v) => (await fetch(`https://${dom}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})})).json();
const c = await g(`query($q:String!){ productsCount(query:$q){ count } }`, {q:'tag:new-480'});
console.log('produktow z tagiem new-480:', c?.data?.productsCount?.count ?? c);
const s = await g(`query{ products(first:1, query:"tag:new-480"){ edges{ node{ title handle status publishedOnCurrentPublication tags metafields(first:20){ edges{ node{ key value } } } } } } }`);
const n = s?.data?.products?.edges?.[0]?.node;
if (n) {
  const mf = Object.fromEntries(n.metafields.edges.map(e=>[e.node.key, e.node.value]));
  console.log('probka:', JSON.stringify({title:n.title, handle:n.handle, status:n.status, published:n.publishedOnCurrentPublication, tags:n.tags, mf}));
}
