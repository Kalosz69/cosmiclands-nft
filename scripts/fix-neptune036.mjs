// fix-neptune036.mjs — podwójny media z duplikatu przetwarzania; zostaw pierwszy, usuń drugi (jeśli potrzeba)
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>(await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})})).json();
// status mediów: fileStatus
const q=await gql(`query{ product(id:"gid://shopify/Product/neptune-plot-000036"){ id } }`).catch(()=>null);
// product by handle:
const q2=await gql(`query{ products(first:1, query:"handle:neptune-plot-000036"){ nodes{ id media(first:10){ nodes{ id status ... on MediaImage { image { url } } } } } } }`);
const p=q2.data.products.nodes[0];
p.media.nodes.forEach(m=>console.log('  status:',m.status,'|',m.image?.url?.split('/').pop()?.split('?')[0]||'no-url'));
// jeśli oba READY i duplikat — usuń drugi
const ready=p.media.nodes.filter(m=>m.status==='READY');
if(ready.length>1){
  const del=await gql(`mutation(\$ids:[ID!]!){ productDeleteMedia(productId:"${p.id}", mediaIds:\$ids){ deletedMediaIds mediaUserErrors{ message } } }`,{ids:[ready[1].id]});
  console.log('usunięto duplikat:',del.data?.productDeleteMedia?.deletedMediaIds, del.data?.productDeleteMedia?.mediaUserErrors);
}else{
  console.log('READY count:',ready.length,'— brak duplikatu do usunięcia, tylko processing');
}
