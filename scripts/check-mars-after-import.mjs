// check-mars-after-import.mjs — verifikacja po zakończeniu importu 8004
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const CLIENT_SECRET=(t.match(/shpss_[A-Za-z0-9]+/)||[])[0];
const CLIENT_ID=(t.match(/\b[0-9a-f]{32}\b/)||[])[0];
const tr=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'client_credentials'})});
const TOKEN=(await tr.json()).access_token;
const gql=async(q,v={})=>{
  for(let a=0;a<6;a++){
    const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})});
    if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;} const j=await res.json(); if(j.errors||!j.data){await new Promise(s=>setTimeout(s,4000));continue;} return j;
  } throw new Error('retry');
};
let cursor=null;const mars=[];let total=0,withImg=0,noImg=[];
for(;;){
  const j=await gql(`query($c:String){ products(query:"product_type:'Land Plot'", first:250, after:$c){ nodes{ id handle tags media(first:1){ nodes{ ...on MediaImage{ image{ url } } } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const p of j.data?.products?.nodes||[]){ total++;
    if(p.handle.startsWith('mars-plot')){ mars.push(p); if(p.media?.nodes?.[0]?.image?.url) withImg++; else noImg.push(p.handle); }
  }
  if(!j.data?.products?.pageInfo?.hasNextPage)break; cursor=j.data.products.pageInfo.endCursor;
}
console.log('TOTAL:',total,'| MARS:',mars.length,'| z obrazkiem:',withImg,'| bez:',noImg.length);
if(noImg.length) console.log('bez obrazka (pierwsze 10):',noImg.slice(0,10).join(','));
fs.writeFileSync('build/check-mars-after-import.json',JSON.stringify({total,mars:mars.length,withImg,noImg},null,1));