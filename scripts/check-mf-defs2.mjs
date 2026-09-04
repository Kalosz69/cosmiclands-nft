// check-mf-defs2.mjs — pełna lista definicji metafields (wszystkie namespace'y), read-only
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const TOKEN=(await r.json()).access_token;
const gql=async(q,v={})=>(await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})})).json();
let cursor=null; const all=[];
for(;;){
  const res=await gql(`query($c:String){ metafieldDefinitions(first:100, after:$c, ownerType:PRODUCT){ nodes{ namespace key type{ name } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  if(!res.data?.metafieldDefinitions){ console.log('FAIL:',JSON.stringify(res).slice(0,200)); break; }
  all.push(...res.data.metafieldDefinitions.nodes);
  if(!res.data.metafieldDefinitions.pageInfo.hasNextPage) break;
  cursor=res.data.metafieldDefinitions.pageInfo.endCursor;
}
const by={};
for(const n of all) (by[n.namespace]=by[n.namespace]||[]).push(n.key);
for(const [ns,keys] of Object.entries(by)) console.log(ns+' ('+keys.length+'): '+keys.join(', '));