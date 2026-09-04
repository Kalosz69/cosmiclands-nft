// check-apps-ids.mjs — aplikacje z ID instalacji i API key (read-only)
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>(await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})})).json();
let cursor=null;
for(;;){
  const res=await gql(`query($c:String){ appInstallations(first:50, after:$c){ nodes{ id app{ id title developerName } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  if(!res.data?.appInstallations){ console.log('FAIL:',JSON.stringify(res).slice(0,200)); break; }
  res.data.appInstallations.nodes.forEach(n=>console.log('install:',n.id,'\n  app:',n.app.title,'| dev:',n.app.developerName,'| appId:',n.app.id,'\n'));
  if(!res.data.appInstallations.pageInfo.hasNextPage) break;
  cursor=res.data.appInstallations.pageInfo.endCursor;
}
