// wipe-mars-62.mjs — KASACJA 62 Marsa (1A, GO K 09.09): productDelete po id z backupu.
// Tylko handles mars-plot-*. Nie rusza 7 planet. Raport build/wipe-mars-report.json
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
if(!T){console.log('TOKEN FAIL');process.exit(1);}
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}const j=await res.json();if(j.errors||!j.data){await new Promise(s=>setTimeout(s,4000));continue;}return j;}};
const DEL=`mutation($id:ID!){ productDelete(id:$id){ deletedProductId userErrors{field message} } }`;
const inv=JSON.parse(fs.readFileSync('build/inventory-full-pre-wipe.json','utf8'));
const mars=inv.products.filter(p=>p.handle.startsWith('mars-plot'));
console.log('do usunięcia:', mars.length);
const report={started:new Date().toISOString(), ok:[], failed:[], total:mars.length};
for(const p of mars){
  try{
    const res=await gql(DEL,{id:p.id});
    if(res.data?.productDelete?.deletedProductId) report.ok.push(p.handle);
    else report.failed.push({handle:p.handle,errors:res.data?.productDelete?.userErrors||res});
  }catch(e){ report.failed.push({handle:p.handle,errors:[{message:String(e).slice(0,200)}]}); }
  fs.writeFileSync('build/wipe-mars-report.json',JSON.stringify(report,null,1));
  process.stdout.write(`\r${report.ok.length}/${mars.length}`);
  await new Promise(s=>setTimeout(s,300));
}
console.log('\nUSUNIĘTO:', report.ok.length, '| FAIL:', report.failed.length);
report.failed.slice(0,10).forEach(f=>console.log(' FAIL',f.handle));