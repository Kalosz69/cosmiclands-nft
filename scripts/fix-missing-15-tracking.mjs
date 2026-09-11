// fix-missing-15-tracking.mjs — tracked=false + requiresShipping=false dla 15 doimportowanych działek
import fs from 'node:fs';
const SHOP='rzkhvb-m1.myshopify.com';
const MISSING=["jupiter-plot-006799","mercury-plot-007002","uranus-plot-006697","uranus-plot-006698","uranus-plot-006699","uranus-plot-006700","neptune-plot-007459","neptune-plot-007480","neptune-plot-007486","neptune-plot-007487","neptune-plot-007502","pluto-plot-005358","pluto-plot-005389","pluto-plot-005415","pluto-plot-005425"];
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const cid=t.match(/\b[0-9a-f]{32}\b/)[0], sec=t.match(/shpss_[A-Za-z0-9]+/)[0];
const TOKEN=(await (await fetch(`https://${SHOP}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:sec,grant_type:'client_credentials'})})).json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,2000));continue;}return res.json();}};
let ok=0,fail=0;
for(const h of MISSING){
  const d=await gql(`query($h:String!){productByHandle(handle:$h){variants(first:1){edges{node{inventoryItem{id}}}}}}`,{h});
  const gid=d.data?.productByHandle?.variants?.edges?.[0]?.node?.inventoryItem?.id;
  if(!gid){console.log('BRAK item:',h);fail++;continue;}
  const r=await gql(`mutation($id:ID!){inventoryItemUpdate(id:$id,input:{tracked:false,requiresShipping:false}){inventoryItem{id tracked requiresShipping} userErrors{field message}}}`,{id:gid});
  const it=r.data?.inventoryItemUpdate?.inventoryItem;
  const ue=r.data?.inventoryItemUpdate?.userErrors;
  if(ue?.length){console.log('FAIL',h,JSON.stringify(ue));fail++;}else{console.log(h,'tracked='+it.tracked,'requiresShipping='+it.requiresShipping);ok++;}
}
console.log(`OK=${ok} FAIL=${fail}`);
