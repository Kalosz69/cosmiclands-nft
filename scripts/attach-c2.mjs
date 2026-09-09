// attach-c2.mjs — 26 produktów mercury-m/uranus-m: attach przez originalSource,
// wyniki zapisywane natychmiast (crash-safe), bez polla (poll crashnął na rate-limit).
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};
const C='https://cdn.shopify.com/s/files/1/1042/7367/4581/files';
const KEYS={
 'mercury-m':`${C}/mercury-m_fec7fbee-a325-46f0-8db0-21b5ce4593fb.png?v=1778960425`,
 'uranus-m':`${C}/uranus-m_6eb5b0f5-a939-4be3-afe0-f53308ee45bb.png?v=1778960182`,
};
const todo=[]; let cursor=null;
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle tags media(first:1){ nodes{ id } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const p of j.data.products.nodes){
    if(p.media.nodes.length) continue;
    const planet=['mercury','uranus'].find(x=>p.handle.startsWith(x));
    const cls=p.tags.includes('class-m')?'m':null;
    if(planet&&cls) todo.push({id:p.id,handle:p.handle,key:`${planet}-${cls}`});
  }
  if(!j.data.products.pageInfo.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log('bez media:', todo.length);
const MUT=`mutation($p:ProductSetInput!){ productSet(input:$p){ product{ id featuredMedia{ ...on MediaImage{ image{ url } } } } userErrors{ field message } } }`;
const out=`build/attach-c2-${Date.now()}.json`;
const report={started:new Date().toISOString(), ok:[], failed:[]};
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,1));
for(const p of todo){
  try{
    const res=await gql(MUT,{p:{id:p.id, files:[{originalSource:KEYS[p.key]}]}});
    const ps=res.data?.productSet;
    const url=ps?.product?.featuredMedia?.image?.url;
    if(url){ report.ok.push({handle:p.handle,url}); console.log('OK',p.handle,'→',url.split('/').pop()); }
    else { const err=JSON.stringify(ps?.userErrors||res.errors||'[]'); report.failed.push({handle:p.handle,err:err.slice(0,300)}); console.log('ERR',p.handle,err.slice(0,160)); }
  }catch(e){ report.failed.push({handle:p.handle,err:String(e).slice(0,300)}); console.log('EXC',p.handle,String(e).slice(0,160)); }
  save();
  await new Promise(s=>setTimeout(s,400));
}
console.log(`koniec: ok=${report.ok.length} fail=${report.failed.length}`);
console.log('raport:',out);
