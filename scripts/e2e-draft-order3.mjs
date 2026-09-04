// e2e-draft-order3.mjs — kupno KOMERCYJNEJ (mars-plot-000013, R01, €50) → Sold=1 test
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};
const prod=await gql(`query{ products(first:1, query:"handle:mars-plot-000013"){ nodes{ variants(first:1){ nodes{ id sku price } } } } }`);
const v=prod.data.products.nodes[0]?.variants.nodes[0];
console.log('variant:',v?.sku,'€'+v?.price);
const d=await gql(`mutation($input:DraftOrderInput!){ draftOrderCreate(input:$input){ draftOrder{ id name } userErrors{ field message } } }`,{input:{lineItems:[{variantId:v.id,quantity:1}],email:'e2e-test@gmail.com',tags:['e2e-test'],note:'E2E sold-counter commercial test 04.09'}});
const de=d.data?.draftOrderCreate;
console.log('draft:',de?.draftOrder?.name, de?.userErrors);
if(!de?.draftOrder) process.exit(1);
const mp=await gql(`mutation($id:ID!){ draftOrderComplete(id:$id){ draftOrder{ order{ name } } userErrors{ field message } } }`,{id:de.draftOrder.id});
console.log('order:',mp.data?.draftOrderComplete?.draftOrder?.order?.name);
