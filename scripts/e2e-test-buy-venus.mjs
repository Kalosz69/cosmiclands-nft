// e2e-test-buy-venus.mjs — TEST KUPNA (B4, mandat K 09.09): draft order → paid → poller pełny łańcuch.
// Działka: VENUS-PLOT-000001 (Class S, Maxwell, €50) → mint na adres testowy 0xD197…E880 (DIRECT_WALLET)
// → grant COSMO → PDF → email na kalosorama@gmail.com.
// Nie mintuje sam — tworzy paid order; przetwarza go DZIAŁAJĄCY poller (pełny łańcuch).
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid = t.match(/\b[0-9a-f]{32}\b/)[0];
const VARIANT = 'gid://shopify/ProductVariant/54859272716629'; // VENUS-PLOT-000001
const WALLET = '0xD197fEA004F3c6Fd3B7657b2eD32D8eCFA9EE880'; // adres testowy K
const EMAIL = 'kalosorama@gmail.com';

const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T = (await r.json()).access_token;
const gql = async (q,v={}) => { for(;;){ const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})}); if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;} return res.json(); } };

// 1) draft order z wallet_address + email
const d = await gql(`mutation($input: DraftOrderInput!){
  draftOrderCreate(input:$input){ draftOrder{ id name } userErrors{ field message } }
}`, {input:{
  lineItems:[{variantId:VARIANT, quantity:1}],
  email:EMAIL,
  tags:['e2e-test'],
  note:'B4 test kupna 09.09: venus-000001 → 0xD197 (pełny łańcuch: mint+grant+pdf+email)',
  customAttributes:[{key:'wallet_address', value:WALLET}],
}});
const de = d.data?.draftOrderCreate;
if(!de?.draftOrder){ console.error('FAIL draftOrderCreate:', JSON.stringify(de||d).slice(0,300)); process.exit(1); }
console.log('draftOrder:', de.draftOrder.name, de.draftOrder.id);

// 2) complete (markPaid → orders/paid → poller przetworzy)
const mp = await gql(`mutation($id:ID!){ draftOrderComplete(id:$id){ draftOrder{ id order{ id name } } userErrors{ field message } } }`, {id:de.draftOrder.id});
console.log('complete:', JSON.stringify(mp.data?.draftOrderComplete||mp).slice(0,300));
