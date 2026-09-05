// VERIFY read-only: czy 10 działek jest PUBLIKOWANYCH (publishedAt + onlineStoreUrl + publishedOnCurrentPublication)
import fs from 'node:fs';
const SHOP = 'rzkhvb-m1.myshopify.com';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:t.match(/\b[0-9a-f]{32}\b/)[0], client_secret:t.match(/shpss_[A-Za-z0-9]+/)[0], grant_type:'client_credentials'}),
});
const TOKEN = (await tr.json()).access_token;
const q = `{
  count: productsCount(query: "handle:mars-plot-0000*") { count }
  products(first: 12, query: "handle:mars-plot-0000*") {
    nodes {
      handle status publishedAt onlineStoreUrl
      featuredMedia { id }
      variants(first:1){ nodes { sku price inventoryQuantity } }
    }
  }
}`;
const res = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
  method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
  body: JSON.stringify({query:q})
});
const j = await res.json();
console.log('count:', j.data?.count?.count);
for (const n of j.data?.products?.nodes ?? []) {
  console.log(`${n.handle} | ${n.status} | pub:${n.publishedAt ?? 'NIGDY'} | url:${n.onlineStoreUrl ?? '—'} | media:${n.featuredMedia ? 'TAK' : 'brak'} | ${n.variants.nodes[0]?.sku} €${n.variants.nodes[0]?.price} inv:${n.variants.nodes[0]?.inventoryQuantity}`);
}
if (j.errors) console.log('errors:', JSON.stringify(j.errors).slice(0,300));
