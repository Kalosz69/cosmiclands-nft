// e2e-draft-order.mjs — E2E test kupna (mandat K 04.09): draft order → paid → webhook orders/paid
// → worker atomowo ustawia mf_sale_status=sold w KV → mapa pokazuje sold.
// KROK 1: draftOrderCreate (MARS-PLOT-000006, €50) → orderMarkPaid (markPaid: true)
// UWAGA: poller STOP (deed_addr=""), NFT/COSMO nie mintują — testuje się WYŁĄCZNIE ścieżka
// Shopify→webhook→KV→mapa (mandat: "kupno testowe przez draft order Admin API").
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
// 1) znajdź variant MARS-PLOT-000006
const prod=await gql(`query{ products(first:1, query:"handle:mars-plot-000006"){ nodes{ id handle variants(first:1){ nodes{ id sku price } } } } }`);
const v=prod.data.products.nodes[0]?.variants.nodes[0];
if(!v){ console.error('FAIL: brak variantu'); process.exit(1); }
console.log('variant:',v.sku,'€'+v.price);
// 2) draft order create + markPaid w jednej mutacji
const d=await gql(`mutation($input: DraftOrderInput!){
  draftOrderCreate(input:$input){ draftOrder{ id name } userErrors{ field message } }
}`,{input:{
  lineItems:[{variantId:v.id,quantity:1}],
  email:'e2e-test@gmail.com',
  tags:['e2e-test'],
  note:'E2E pipeline test 04.09',
}});
const de=d.data?.draftOrderCreate;
if(!de?.draftOrder){ console.error('FAIL draftOrderCreate:',JSON.stringify(de||d).slice(0,300)); process.exit(1); }
console.log('draftOrder:',de.draftOrder.name,de.draftOrder.id);
// 3) markPaid (kompletuje zamówienie → orders/paid webhook)
const mp=await gql(`mutation($id:ID!){ draftOrderComplete(id:$id){ draftOrder{ id order{ id name } } userErrors{ field message } } }`,{id:de.draftOrder.id});
console.log('complete:',JSON.stringify(mp.data?.draftOrderComplete||mp).slice(0,300));
