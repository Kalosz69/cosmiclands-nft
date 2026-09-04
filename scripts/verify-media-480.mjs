// verify-media-480.mjs — live weryfikacja: ile produktów ma featuredMedia, sample URL-i
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{
  for(;;){
    const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});
    if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}
    return res.json();
  }
};
let withMedia=0, without=[], cursor=null, total=0; const samples=[];
for(;;){
  const res=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ handle featuredMedia{ ... on MediaImage { image { url } } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  if(!res.data?.products){ console.error('GraphQL FAIL:', JSON.stringify(res).slice(0,300)); process.exit(1); }
  for(const p of res.data.products.nodes){
    total++;
    if(p.featuredMedia?.image?.url){ withMedia++; if(samples.length<5) samples.push(p.handle+' → '+p.featuredMedia.image.url.split('/').pop().split('?')[0]); }
    else without.push(p.handle);
  }
  if(!res.data.products.pageInfo.hasNextPage) break;
  cursor=res.data.products.pageInfo.endCursor;
}
console.log(`produkty: ${total} | z obrazkiem: ${withMedia} | bez: ${without.length}`);
console.log('sample:'); samples.forEach(s=>console.log('  '+s));
if(without.length) console.log('BRAKI:',without.slice(0,10).join(', '));
