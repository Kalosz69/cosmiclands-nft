// check-test-orders.mjs — lista zamówień testowych e2e (status finansowy, kwoty)
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>(await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})})).json();
const res=await gql(`query{ orders(first:10, query:"tag:e2e-test", sortKey:CREATED_AT, reverse:true){ nodes{ name createdAt displayFinancialStatus displayFulfillmentStatus tags lineItems(first:1){ nodes{ sku quantity } } } } }`);
res.data.orders.nodes.forEach(o=>{
  console.log(o.name,'|',o.displayFinancialStatus,'| fulfill:',o.displayFulfillmentStatus,'|',o.lineItems.nodes.map(li=>li.sku+'×'+li.quantity).join(','),'| tags:',o.tags.join(','));
});
