// READ-ONLY: pełna lista metafield definitions w Shopify (źródło prawdy theme/formularza)
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
let TOKEN;
const oauth = async () => {
  const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({client_id: id, client_secret: secret, grant_type: 'client_credentials'}),
  });
  TOKEN = (await r.json()).access_token;
};
await oauth();
const gql = async (query, variables = {}) => {
  const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'X-Shopify-Access-Token': TOKEN},
    body: JSON.stringify({query, variables}),
  });
  return r.json();
};
// definicje na poziomie sklepu (PRODUCT)
const res = await gql(`{ metafieldDefinitions(first: 100, ownerType: PRODUCT) { nodes { namespace key name type { name } } } }`);
const defs = res?.data?.metafieldDefinitions?.nodes ?? [];
console.log('DEFINICJE PRODUCT:', defs.length);
const byNs = {};
for (const d of defs) { (byNs[d.namespace] ??= []).push(`${d.key} [${d.type.name}]`); }
for (const [ns, keys] of Object.entries(byNs)) console.log(`\n${ns}.* (${keys.length}):`, keys.join(', '));
// też SAMPLE_STANDARD
const res2 = await gql(`{ metafieldDefinitions(first: 100, ownerType: PRODUCT, namespace: "custom") { nodes { namespace key name type { name } } } }`);
console.log('\ncustom.* nodes:', res2?.data?.metafieldDefinitions?.nodes?.length ?? 0);
