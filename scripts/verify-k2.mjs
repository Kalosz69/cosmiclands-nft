// VERIFY K2 — read-only: count per planeta (tag), publishedAt, media, cena/inv próbki; Mars 1–10 nietknięte?
// Wzór: verify-k10.mjs (linia K). Dowód = output, nie deklaracja.
import fs from 'node:fs';
const SHOP = 'rzkhvb-m1.myshopify.com';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:t.match(/\b[0-9a-f]{32}\b/)[0], client_secret:t.match(/shpss_[A-Za-z0-9]+/)[0], grant_type:'client_credentials'}),
});
const TOKEN = (await tr.json()).access_token;
const gql = async (q, v={}) => {
  for (;;) {
    const res = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
      body: JSON.stringify({query:q, variables:v})});
    if (res.status===429){ await new Promise(s=>setTimeout(s,3000)); continue; }
    return res.json();
  }
};

const PLANETS = ['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'];
let total = 0;
const summary = [];
for (const pl of PLANETS) {
  const q = `{
    c1: productsCount(query: "tag:${pl}-plot") { count }
  }`;
  const r = await gql(q);
  const n = r.data?.c1?.count ?? -1;
  total += n;
  summary.push(`${pl}: ${n}`);
  if (r.errors) console.log('errors:', JSON.stringify(r.errors).slice(0,200));
}
console.log('COUNT per planeta (tag <planeta>-plot):', summary.join(' | '), `| TOTAL: ${total}`);

// próbka: 3 działki nie-mars + 1 mars K2 — pełny wykaz
const sample = await gql(`{
  products(first: 4, query: "tag:venus-plot OR tag:pluto-plot OR tag:jupiter-plot OR handle:mars-plot-000011") {
    nodes { handle status publishedAt onlineStoreUrl
      featuredMedia { id }
      variants(first:1){ nodes { sku price inventoryQuantity } }
    }
  }
}`);
for (const n of sample.data?.products?.nodes ?? []) {
  console.log(`${n.handle} | ${n.status} | pub:${n.publishedAt ? 'TAK' : 'NIGDY'} | url:${n.onlineStoreUrl ? 'TAK' : '—'} | media:${n.featuredMedia ? 'TAK' : 'brak'} | ${n.variants.nodes[0]?.sku} €${n.variants.nodes[0]?.price} inv:${n.variants.nodes[0]?.inventoryQuantity}`);
}
if (sample.errors) console.log('errors:', JSON.stringify(sample.errors).slice(0,300));

// żywe 1–10 nietknięte? (count dokładnie 10 + 000007 nadal sprzedane przez inv=0)
const live = await gql(`{ products(first: 12, query: "handle:mars-plot-0000*") { nodes { handle variants(first:1){ nodes { inventoryQuantity } } } } }`);
const l = live.data?.products?.nodes ?? [];
const p7 = l.find(x => x.handle === 'mars-plot-000007');
console.log(`żywe mars 0000xx: ${l.length} (oczekiwane 10) | 000007 inv: ${p7?.variants.nodes[0]?.inventoryQuantity}`);
