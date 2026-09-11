// inv-verify.mjs — read-only: rozkład inventory_quantity × planeta (bulk query, bez mutacji)
import fs from 'node:fs';
const SHOP='rzkhvb-m1.myshopify.com';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const cid=(t.match(/Id klienta\s+([0-9a-f]{32})/i)||[])[1];
const sec=(t.match(/Klucz tajny\s+(shpss_[0-9a-f]+)/i)||[])[1];
const tok=(await (await fetch(`https://${SHOP}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:sec,grant_type:'client_credentials'})})).json()).access_token;
const gql=async q=>(await (await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'X-Shopify-Access-Token':tok,'Content-Type':'application/json'},body:JSON.stringify({query:q})})).json());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const d=await gql(`mutation{bulkOperationRunQuery(query:"""{
  products { edges { node { id handle tags variants { edges { node { sku inventoryQuantity inventoryPolicy } } } } } }
}"""){bulkOperation{id status} userErrors{field message}}}`);
if(d.data.bulkOperationRunQuery.userErrors.length){console.error(JSON.stringify(d.data.bulkOperationRunQuery.userErrors));process.exit(1);}
console.log('bulk kicked:',d.data.bulkOperationRunQuery.bulkOperation.id);
let url=null,op;
while(!url){await sleep(7000);const p=await gql(`{currentBulkOperation{status url errorCode objectCount}}`);op=p.data.currentBulkOperation;console.log('status',op.status,op.objectCount||'');if(op.status==='COMPLETED')url=op.url;if(op.status==='FAILED'){console.error(op.errorCode);process.exit(1);}}
const lines=(await (await fetch(url)).text()).trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
// products lines (maja tags) i warianty (maja __parentId + inventoryQuantity)
const byPlanet={}, invDist={}, pubDist={};
let variants=0, productsSeen=0;
for(const o of lines){
  if(o.tags!==undefined){ // product
    productsSeen++;
    const tags=Array.isArray(o.tags)?o.tags:String(o.tags||'').split(',');
    const pl=tags.map(s=>String(s).trim().toLowerCase()).find(x=>['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'].includes(x))||'?';
    o.__pl=pl; byPlanet[pl]=byPlanet[pl]||{prod:0,avail:0,zero:0,soldq:0};
    byPlanet[pl].prod++;
  }
}
// mapowanie parent->planet
const prodByGid={}, handleByGid={};
for(const o of lines) if(o.tags!==undefined) { prodByGid[o.id]=o.__pl; handleByGid[o.id]=o.handle; }
const soldHandles=[];
for(const o of lines){
  if(o.__parentId && o.inventoryQuantity!==undefined){ // variant
    variants++;
    const pl=prodByGid[o.__parentId]||'?';
    const q=o.inventoryQuantity;
    invDist[q]=(invDist[q]||0)+1;
    if(q>0) byPlanet[pl].avail++; else { byPlanet[pl].zero++; soldHandles.push(handleByGid[o.__parentId]); }
  }
}
console.log('\n=== per planeta ===');
for(const [pl,v] of Object.entries(byPlanet).sort()) console.log(`${pl.padEnd(8)} produkty=${v.prod} inv>0=${v.avail} inv=0=${v.zero}`);
console.log('\n=== rozkład inventoryQuantity (variants) ===', JSON.stringify(invDist));
console.log('razem produkty:',productsSeen,'warianty:',variants);
console.log('SOLD (inv=0) handles:',JSON.stringify(soldHandles));
