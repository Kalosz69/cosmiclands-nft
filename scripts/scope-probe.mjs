// READ-ONLY probe scope'ów obecnych creds (shop.txt) — co umie, czego nie
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid = t.match(/"client_id":\s*"([0-9a-f]{32})"/)?.[1] ?? t.match(/([0-9a-f]{32})/)[1];
const tok = (await (await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:cid, client_secret:secret, grant_type:'client_credentials'})
})).json()).access_token;
const gql = async (q,v={}) => (await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
  method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':tok},
  body: JSON.stringify({query:q,variables:v}) })).json();
const test = async (name,q) => {
  const r = await gql(q);
  const err = r.errors?.map(e=>e.message).join('; ') ?? '';
  console.log(`${err? '❌':'✅'} ${name}${err? ' → '+err.slice(0,120): ''}`);
  return r;
};
await test('read_orders (ordersCount)', `{ ordersCount(query:"") { count } }`);
await test('read_webhooks (webhookSubscriptions)', `{ webhookSubscriptions(first:3){ nodes{ id topic endpoint{__typename} } } }`);
await test('read_metaobjects (definitions)', `{ metafieldDefinitions(first:5, namespace:"custom", ownerType:PRODUCT){ nodes{ key } } }`);
await test('read_inventory (inventoryItems)', `{ inventoryItems(first:3){ nodes{ id sku } } }`);
await test('read_customers (customersCount)', `{ customersCount(query:""){ count } }`);