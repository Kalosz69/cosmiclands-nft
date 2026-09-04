// PEŁNY backup inwentarza przed wipe (read-only): id+handle+title+status+type wszystkich produktów
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:id, client_secret:secret, grant_type:'client_credentials'}),
});
const TOKEN = (await r.json()).access_token;
const gql = async (q,v={}) => {
  const res = await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
    method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body: JSON.stringify({query:q,variables:v})
  });
  if (res.status===429){ await new Promise(s=>setTimeout(s,3000)); return gql(q,v); }
  return res.json();
};
const all = []; let cursor = null;
for (;;) {
  const res = await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle title status productType } pageInfo{ hasNextPage endCursor } } }`, {c:cursor});
  if (!res?.data?.products) { console.log('SUROWA ODPOWIEDŹ:', JSON.stringify(res).slice(0,500)); process.exit(1); }
  all.push(...res.data.products.nodes);
  if (!res.data.products.pageInfo.hasNextPage) break;
  cursor = res.data.products.pageInfo.endCursor;
}
fs.writeFileSync('build/inventory-full-pre-wipe.json', JSON.stringify({fetched:new Date().toISOString(), count:all.length, products:all}, null, 1));
console.log('BACKUP: build/inventory-full-pre-wipe.json |', all.length, 'produktów');