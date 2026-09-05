// PROBE: 1 produkt linią K, pełny dump odpowiedzi GraphQL (diagnoza productSet fail)
import fs from 'node:fs';
const SHOP = 'rzkhvb-m1.myshopify.com';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const CLIENT_ID = t.match(/\b[0-9a-f]{32}\b/)[0];
const CLIENT_SECRET = t.match(/shpss_[A-Za-z0-9]+/)[0];
const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:CLIENT_ID, client_secret:CLIENT_SECRET, grant_type:'client_credentials'}),
});
const TOKEN = (await tr.json()).access_token;
const manifest = JSON.parse(fs.readFileSync('/opt/data/scripts/mars-manifest.json','utf8'));
const p = manifest[0];

const q = `mutation($input: ProductSetInput!) {
  productSet(input: $input) {
    product { id handle }
    userErrors { field message }
  }
}`;
const input = {
  handle: p.handle, title: p.title, vendor: p.vendor, productType: p.product_type,
  status: 'ACTIVE', tags: p.tags.split(', '),
  variants: [{ sku: p.sku, price: String(p.price), inventoryPolicy: 'DENY' }],
  metafields: [
    { namespace:'plot', key:'plot_id', type:'single_line_text_field', value:p.mf_plot_id },
  ],
};
const res = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
  method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
  body: JSON.stringify({query:q, variables:{input}})
});
console.log('HTTP', res.status);
console.log(JSON.stringify(await res.json(), null, 1).slice(0, 2000));
