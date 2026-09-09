// test-wipe-mars.mjs — TEST skryptu kasowania Marsa (limitowana próbka)
// Użycie: node scripts/test-wipe-mars.mjs --limit N  (domyślnie 3)
// Cel: WERYFIKACJA poprawności productDelete na produkcji, MAŁA skala, bez dotykania 7 planet.
import fs from 'node:fs';
const LIMIT=parseInt(process.argv.find(a=>a.startsWith('--limit'))?.split('=')[1]||'3',10);

const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const CLIENT_SECRET=(t.match(/shpss_[A-Za-z0-9]+/)||[])[0];
const CLIENT_ID=(t.match(/\b[0-9a-f]{32}\b/)||[])[0];
const tr=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'client_credentials'})});
const TOKEN=(await tr.json()).access_token;
if(!TOKEN){console.log('TOKEN FAIL');process.exit(1);}

const gql=async(q,v={})=>{
  for(let a=0;a<6;a++){
    const res=await fetch(`https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})});
    if(res.status===429){await new Promise(s=>setTimeout(s,3000*(a+1)));continue;}
    const j=await res.json();
    if(j.errors||!j.data){await new Promise(s=>setTimeout(s,3000*(a+1)));continue;}
    return j;
  }
  throw new Error('gql wyczerpane retry');
};
const DEL=`mutation productDelete($id: ID!){ productDelete(input:{id:$id}){ deletedProductId userErrors{ field message } } }`;

const inv=JSON.parse(fs.readFileSync('build/inventory-full-pre-wipe.json','utf8'));
const mars=inv.products.filter(p=>p.handle.startsWith('mars-plot')).slice(0,LIMIT);
console.log(`TEST KASOWANIA — próbka ${mars.length}/${LIMIT}`);
const report={started:new Date().toISOString(),ok:[],failed:[],limit:LIMIT};
for(const p of mars){
  try{
    const res=await gql(DEL,{id:p.id});
    if(res.data?.productDelete?.deletedProductId) report.ok.push(p.handle);
    else report.failed.push({handle:p.handle,errors:res.data?.productDelete?.userErrors||res});
  }catch(e){report.failed.push({handle:p.handle,errors:[{message:String(e).slice(0,200)}]});}
  fs.writeFileSync('build/test-wipe-report.json',JSON.stringify(report,null,1));
  await new Promise(s=>setTimeout(s,250));
}
console.log('\nTEST WYNIK: OK=',report.ok.length,'FAIL=',report.failed.length);
console.log('OK:',report.ok.join(', '));
console.log('FAIL:',JSON.stringify(report.failed.slice(0,3),null,1).slice(0,400));