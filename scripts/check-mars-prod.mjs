// check-mars-prod.mjs — READ-ONLY przegląd produkcji: ile Marsa jest, ile z obrazkami
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}const j=await res.json();if(j.errors||!j.data){await new Promise(s=>setTimeout(s,4000));continue;}return j;}};
let cursor=null; const mars=[]; let total=0;
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle featuredMedia{ ... on MediaImage{ image{ url } } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const p of j.data?.products?.nodes||[]){ total++;
    if(p.handle?.startsWith('mars-plot')) mars.push({id:p.id,handle:p.handle,img:p.featuredMedia?.image?.url||''});
  }
  if(!j.data?.products?.pageInfo?.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log('TOTAL produktów na sklepie:', total);
console.log('MARS do usunięcia:', mars.length);
const imgs={}; for(const m of mars) imgs[m.img?m.img.split('/files/')[1]?.split('?')[0]:'(brak)']=(imgs[m.img?m.img.split('/files/')[1]?.split('?')[0]:'(brak)']||0)+1;
console.log('Obrazki wśród mars:', JSON.stringify(imgs));
console.log('sample:', JSON.stringify(mars.slice(0,5)));