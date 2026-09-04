// check-mf-definitions.mjs — definicje metafields w sklepie (custom.* / land.* / plot.*) — read-only
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const TOKEN=(await r.json()).access_token;
const gql=async(q,v={})=>(await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})})).json();
const res=await gql(`{ metafieldDefinitions(first:100){ nodes{ namespace key type{ name } name } } }`);
console.log('custom.* definicje:');
for(const n of res.data?.metafieldDefinitions?.nodes??[]) console.log('  '+n.namespace+'.'+n.key+' ('+n.type?.name+')');
const res2=await gql(`{ metafieldDefinitions(first:100, namespace:"land"){ nodes{ namespace key type{ name } name } } }`);
console.log('land.* definicje:');
for(const n of res2.data?.metafieldDefinitions?.nodes??[]) console.log('  '+n.namespace+'.'+n.key+' ('+n.type?.name+')');
const res3=await gql(`{ metafieldDefinitions(first:100, namespace:"plot"){ nodes{ namespace key type{ name } } } }`);
console.log('plot.* definicje:', (res3.data?.metafieldDefinitions?.nodes??[]).map(n=>n.key).join(', '));