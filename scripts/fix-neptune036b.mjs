// fix-neptune036b.mjs — media FAILED ×2: usuń oba, dodaj 1 świeży z URL CDN
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>(await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})})).json();
const q2=await gql(`query{ products(first:1, query:"handle:neptune-plot-000036"){ nodes{ id tags media(first:10){ nodes{ id status } } } } }`);
const p=q2.data.products.nodes[0];
// 1) usuń FAILED
const del=await gql(`mutation($pid:ID!,$ids:[ID!]!){ productDeleteMedia(productId:$pid, mediaIds:$ids){ deletedMediaIds mediaUserErrors{ message } } }`,{pid:p.id,ids:p.media.nodes.map(m=>m.id)});
console.log('usunięto:',del.data?.productDeleteMedia?.deletedMediaIds);
// 2) świeży upload
const cls=p.tags.includes('class-xl')?'xl':p.tags.includes('class-l')?'l':p.tags.includes('class-m')?'m':'s';
const url={s:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/neptune-s.png?v=1778958830',m:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/neptune-m.png?v=1778958830',l:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/neptune-l.png?v=1778958832',xl:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/neptune-xl.png?v=1778958835'}[cls];
const add=await gql(`mutation($pid:ID!,$media:[CreateMediaInput!]!){ productCreateMedia(productId:$pid, media:$media){ media{ id status } mediaUserErrors{ field message } } }`,{pid:p.id,media:[{mediaContentType:'IMAGE',originalSource:url}]});
console.log('dodano:',JSON.stringify(add.data?.productCreateMedia));
