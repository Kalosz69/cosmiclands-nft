// handle-diff.mjs — read-only: porównaj handle z mapy (KV) vs sklep (live)
import fs from 'node:fs';
const SHOP='rzkhvb-m1.myshopify.com';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const cid=(t.match(/Id klienta\s+([0-9a-f]{32})/i)||[])[1];
const sec=(t.match(/Klucz tajny\s+(shpss_[0-9a-f]+)/i)||[])[1];
const tok=(await (await fetch(`https://${SHOP}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:sec,grant_type:'client_credentials'})})).json()).access_token;
const gql=async q=>(await (await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'X-Shopify-Access-Token':tok,'Content-Type':'application/json'},body:JSON.stringify({query:q})})).json());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const d=await gql(`mutation{bulkOperationRunQuery(query:"""{
  products { edges { node { id handle } } }
}"""){bulkOperation{id status} userErrors{field message}}}`);
if(d.data.bulkOperationRunQuery.userErrors.length){console.error(JSON.stringify(d.data.bulkOperationRunQuery.userErrors));process.exit(1);}
let url=null;
while(!url){await sleep(7000);const p=await gql(`{currentBulkOperation{status url errorCode objectCount}}`);const op=p.data.currentBulkOperation;console.log('status',op.status,op.objectCount||'');if(op.status==='COMPLETED')url=op.url;if(op.status==='FAILED'){console.error(op.errorCode);process.exit(1);}}
const lines=(await (await fetch(url)).text()).trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
const shopHandles=new Set(lines.map(o=>o.handle).filter(Boolean));
console.log('handle w sklepie:',shopHandles.size);
const map=JSON.parse(fs.readFileSync('build/kv-manifest-all-lite.json','utf8'));
const mapHandles=new Set(map.map(r=>r.handle));
console.log('handle na mapie:',mapHandles.size);
const inMapNotShop=[...mapHandles].filter(h=>!shopHandles.has(h));
const inShopNotMap=[...shopHandles].filter(h=>!mapHandles.has(h));
console.log('\nNA MAPIE, BRAK W SKLEPIE ('+inMapNotShop.length+'):',JSON.stringify(inMapNotShop));
console.log('\nW SKLEPIE, BRAK NA MAPIE ('+inShopNotMap.length+'):',JSON.stringify(inShopNotMap));
