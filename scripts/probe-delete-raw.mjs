// probe-delete-raw.mjs — czysty test: co zwraca Shopify na productDelete (RAW, bez retry)
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const CLIENT_SECRET=(t.match(/shpss_[A-Za-z0-9]+/)||[])[0];
const CLIENT_ID=(t.match(/\b[0-9a-f]{32}\b/)||[])[0];
const tr=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'client_credentials'})});
const TOKEN=(await tr.json()).access_token;
const q=`mutation productDelete($id: ID!){ productDelete(input:{id:$id}){ deletedProductId userErrors{ field message } } }`;
const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:{id:'gid://shopify/Product/11567337013589'}})});
console.log('HTTP:',res.status);
console.log('body:', (await res.text()).slice(0,600));