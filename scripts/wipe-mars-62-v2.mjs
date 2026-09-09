// wipe-mars-62-v2.mjs — KASACJA 62 Marsa (1A, GO K 09.09) — v2 odporna:
// - raport dopisywany CO PO KAŻDEJ sztuce (crash-safe)
// - timeout bezpiecznik 35s/request
import fs from 'node:fs';

const SECRET_FILE='/opt/data/.secrets/shop.txt';
const t=fs.readFileSync(SECRET_FILE,'utf8');
const CLIENT_SECRET=(t.match(/shpss_[A-Za-z0-9]+/)||[])[0];
const CLIENT_ID=(t.match(/\b[0-9a-f]{32}\b/)||[])[0];
if(!CLIENT_SECRET||!CLIENT_ID){ console.error('BRAK SEKRETÓW'); process.exit(1); }

const TOKEN_URL=`https://rzkhvb-m1.myshopify.com/admin/oauth/access_token`;
const tr=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'client_credentials'})});
if(!tr.ok){ console.error('TOKEN HTTP',tr.status); process.exit(1); }
const TOKEN=(await tr.json()).access_token;
if(!TOKEN){ console.error('TOKEN EMPTY'); process.exit(1); }

const gql=async(q,v={})=>{
  for(let a=0;a<8;a++){
    const res=await fetch(`https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json`,{
      method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
      body:JSON.stringify({query:q,variables:v})});
    if(res.status===429){ await new Promise(s=>setTimeout(s,3000)); continue; }
    const j=await res.json();
    if(j.errors||!j.data){ await new Promise(s=>setTimeout(s,4000)); continue; }
    return j;
  }
  throw new Error('gql wyczerpane retry');
};

const DEL=`mutation productDelete($id: ID!){ productDelete(input:{id:$id}){ deletedProductId userErrors{ field message } } }`;
const inv=JSON.parse(fs.readFileSync('build/inventory-full-pre-wipe.json','utf8'));
const mars=inv.products.filter(p=>p.handle.startsWith('mars-plot'));
console.log('DO USUNIĘCIA:', mars.length);

const RAPORT='build/wipe-mars-report.json';
const report=fs.existsSync(RAPORT)?JSON.parse(fs.readFileSync(RAPORT,'utf8')):{started:new Date().toISOString(),ok:[],failed:[],total:mars.length};

for(const p of mars){
  if(report.ok.includes(p.handle)||report.failed.some(f=>f.handle===p.handle)) continue; // już obsłużone
  try{
    const res=await gql(DEL,{id:p.id});
    if(res.data?.productDelete?.deletedProductId) report.ok.push(p.handle);
    else report.failed.push({handle:p.handle,errors:res.data?.productDelete?.userErrors||res});
  }catch(e){ report.failed.push({handle:p.handle,errors:[{message:String(e).slice(0,200)}]}); }
  fs.writeFileSync(RAPORT,JSON.stringify(report,null,1));
  process.stdout.write(`\r${report.ok.length}/${mars.length} ok, fail=${report.failed.length}`);
  await new Promise(s=>setTimeout(s,350));
}
console.log('\nKONIEC: OK=',report.ok.length,'FAIL=',report.failed.length);