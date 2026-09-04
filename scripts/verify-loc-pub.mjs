// READ-ONLY: weryfikacja LOCATION_ID i PUBLICATION_ID (fakty ze starych dokumentów)
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
const loc = await gql(`{ locations(first:10){ nodes{ id name isActive fulfillmentService{handle} } } }`);
console.log('LOKACJE:'); (loc.data?.locations?.nodes??[]).forEach(l=>console.log(' ', l.id, '|', l.name, '| active:', l.isActive, '| FFS:', l.fulfillmentService?.handle));
const pub = await gql(`{ publications(first:10){ nodes{ id name } } }`);
console.log('PUBLIKACJE:'); (pub.data?.publications?.nodes??[]).forEach(p=>console.log(' ', p.id, '|', p.name));
console.log('KONTROLA: oczekiwane LOCATION gid://shopify/Location/118795174229, PUBLICATION gid://shopify/Publication/337157751125');