import fs from 'node:fs';
// 1) canonical build manifest — ile sold?
try {
  const m = JSON.parse(fs.readFileSync('/opt/data/workspace/cosmiclands-nft/build/catalog480-canonical-manifest.json','utf8'));
  const sold = m.filter(p=>p.mf_sale_status!=='available');
  console.log('BUILD manifest:', m.length, 'rekordow, non-available:', sold.length);
  console.log('  sold handles:', sold.map(p=>`${p.handle}/${p.mf_sale_status}`).join(', '));
  const st = fs.statSync('/opt/data/workspace/cosmiclands-nft/build/catalog480-canonical-manifest.json');
  console.log('  mtime:', st.mtime.toISOString());
} catch(e){ console.log('BUILD manifest ERR:', e.message); }

// 2) pozostałe sold handle z KV vs Shopify (z KV manifestu)
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

// KV manifest — lista sold
const ct = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const cfTOKEN = ct.match(/cfat_[A-Za-z0-9_-]+/)[0];
const kres = await fetch('https://api.cloudflare.com/client/v4/accounts/f0121aafb566d0cfd1cac0289a32eccf/storage/kv/namespaces/a465f1a1a19848dd9ef32974c88d3b6d/values/manifest', {headers:{Authorization:`Bearer ${cfTOKEN}`}});
const kv = await kres.json();
const kvSold = kv.filter(p=>p.mf_sale_status!=='available');
console.log('\nKV sold:', kvSold.length, '->', kvSold.map(p=>p.handle).join(', '));

// sprawdz kazdy w Shopify
const aliases = {};
kvSold.forEach((p,i)=>{ aliases['h'+i] = `s:productByHandle(handle:"${p.handle}"){ id metafields(first:5){nodes{key value}} status }`; });
const q = `query{ ${Object.values(aliases).join(' ')} }`;
const j = await gql(q);
for (const [k,node] of Object.entries(j.data||{})) {
  const handle = kvSold[+k.slice(1)].handle;
  const ss = node?.metafields?.nodes?.find(m=>m.key==='sale_status')?.value ?? 'BRAK';
  const st = node?.metafields?.nodes?.find(m=>m.key==='status')?.value ?? '?';
  console.log(`${handle}: shop.statu=${node?.status} plot.status=${st} plot.sale_status=${ss}`);
}
