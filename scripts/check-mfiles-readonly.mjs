// check-mfiles-readonly.mjs — read-only: czy pliki mercury-m/uranus-m weszły do biblioteki?
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};
let cursor=null, hits=[], n=0;
for(;;){
  const j=await gql(`query($c:String){ files(first:250, after:$c){ nodes{ ...on MediaImage{ id image{ url } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  if(!j.data?.files){ console.log('GRAPHQL ERR:', JSON.stringify(j).slice(0,200)); process.exit(1); }
  n+=j.data.files.nodes.length;
  for(const f of j.data.files.nodes){ const u=(f.image?.url||'').split('/').pop();
    if(/^mercury-m/.test(u)||/^uranus-m/.test(u)) hits.push(`${u} → ${f.id}`); }
  if(!j.data.files.pageInfo.hasNextPage) break;
  cursor=j.data.files.pageInfo.endCursor;
}
console.log(`plików w bibliotece: ${n}`);
console.log('mercury-m / uranus-m:'); hits.forEach(h=>console.log(' ',h));
if(!hits.length) console.log('  (brak — pliki wciąż nie weszły do biblioteki)');
