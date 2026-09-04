// check-neptune036.mjs — dlaczego neptune-plot-000036 nie ma media (processing? błąd?)
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>(await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})})).json();
const q=await gql(`query{ products(first:1, query:"handle:neptune-plot-000036"){ nodes{ id handle tags media(first:10){ nodes{ id alt ... on MediaImage { image { url } } } } } } }`);
const p=q.data.products.nodes[0];
console.log('handle:',p.handle);
console.log('media count:',p.media.nodes.length);
p.media.nodes.forEach(m=>console.log('  media:',m.id,'|',m.image?.url?.split('/').pop()?.split('?')[0]||'(processing?)'));
