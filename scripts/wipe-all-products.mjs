// FAZA 1 — WIPE: usuwa WSZYSTKIE produkty ze sklepu (GO K 02.09: "usuwasz wszystkie rzeczy z shopify")
// Per-product productDelete, pacing 300ms, resumable (istniejące pomija), raport build/wipe-report.json
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
  for (;;) {
    const res = await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
      method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body: JSON.stringify({query:q,variables:v})
    });
    if (res.status===429){ await new Promise(s=>setTimeout(s,3000)); continue; }
    return res.json();
  }
};
const MUT = `mutation($id: ID!){ productDelete(input:{id:$id}){ deletedProductId userErrors{field message} } }`;
const all = []; let cursor = null;
for (;;) {
  const res = await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle } pageInfo{ hasNextPage endCursor } } }`, {c:cursor});
  if (!res?.data?.products) { console.log('LIST FAIL:', JSON.stringify(res).slice(0,300)); process.exit(1); }
  all.push(...res.data.products.nodes);
  if (!res.data.products.pageInfo.hasNextPage) break;
  cursor = res.data.products.pageInfo.endCursor;
}
console.log('DO USUNIĘCIA:', all.length);
const report = fs.existsSync('build/wipe-report.json') ? JSON.parse(fs.readFileSync('build/wipe-report.json','utf8')) : { started:new Date().toISOString(), ok:0, failed:[], deleted:[], total:all.length };
for (const p of all) {
  try {
    const res = await gql(MUT, {id:p.id});
    const d = res?.data?.productDelete;
    if (d?.deletedProductId) { report.ok++; report.deleted.push(p.handle); }
    else report.failed.push({handle:p.handle, errors:d?.userErrors ?? res});
  } catch(e) { report.failed.push({handle:p.handle, errors:[{message:String(e).slice(0,200)}]}); }
  fs.writeFileSync('build/wipe-report.json', JSON.stringify(report,null,1));
  process.stdout.write(`\r${report.ok}/${all.length} usunięte, fail=${report.failed.length}`);
  await new Promise(s=>setTimeout(s,300));
}
console.log(`\nKONIEC: ok=${report.ok}/${all.length} fail=${report.failed.length}`);