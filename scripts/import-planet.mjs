#!/usr/bin/env node
// import-planet.mjs — pełny import planety do Shopify + nadpisanie starych (productSet z id).
// Użycie: node scripts/import-planet.mjs <Planeta> [--fix] [--limit N]
//   np: node scripts/import-planet.mjs Jupiter          → importuje 8000 z build/jupiter-8000-manifest.json
//       node scripts/import-planet.mjs Jupiter --fix    → po imporcie nadpisuje stare (z id) + brakujące
// Krok 1: productSet (CREATE/UPSERT) — istniejące stare zwrócą "already in use" (fail).
// Krok 2 (--fix): nadpisz stare podając product id (jak fix-venus-50) + doimportuj brakujące.
// Raport: build/import-<planet>-report.json (+ --fix: build/fix-<planet>-report.json)
import fs from 'node:fs';
const NAME=(process.argv[2]||'').toLowerCase();
if(!NAME){console.error('Usage: node scripts/import-planet.mjs <Planeta> [--fix] [--limit N]');process.exit(1);}
const FIX=process.argv.includes('--fix');
const LIMIT=parseInt(process.argv.find(a=>a.startsWith('--limit'))?.split('=')[1]||'8000',10);
const MF='build/'+NAME+'-8000-manifest.json';
if(!fs.existsSync(MF)){console.error('Brak manifestu',MF,'— najpierw generate-planet-manifest');process.exit(1);}
const manifest=JSON.parse(fs.readFileSync(MF,'utf8'));
const batch=manifest.slice(0,LIMIT);
console.log(`import ${NAME}: ${batch.length} z ${MF}`);

const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const CLIENT_SECRET=t.match(/shpss_[A-Za-z0-9]+/)[0];
const CLIENT_ID=t.match(/\b[0-9a-f]{32}\b/)[0];
const LOCATION_ID='gid://shopify/Location/118795174229';
const PUBLICATION_ID='gid://shopify/Publication/337157751125';
const tr=await fetch(`https://rzkhvb-m1.myshopify.com/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'client_credentials'})});
const TOKEN=(await tr.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};
function mf(p){return [
{namespace:'plot',key:'plot_id',type:'single_line_text_field',value:p.mf_plot_id},
{namespace:'plot',key:'planet',type:'single_line_text_field',value:p.mf_planet},
{namespace:'plot',key:'region',type:'single_line_text_field',value:p.mf_region},
{namespace:'plot',key:'region_id',type:'single_line_text_field',value:p.mf_region_id},
{namespace:'plot',key:'region_name',type:'single_line_text_field',value:p.mf_region_name},
{namespace:'plot',key:'class',type:'single_line_text_field',value:p.mf_class},
{namespace:'plot',key:'area_ha',type:'number_decimal',value:String(p.mf_area_ha)},
{namespace:'plot',key:'price_eur',type:'number_decimal',value:String(p.mf_price_eur)},
{namespace:'plot',key:'coordinates_lat',type:'number_decimal',value:String(p.mf_coordinates_lat)},
{namespace:'plot',key:'coordinates_lon',type:'number_decimal',value:String(p.mf_coordinates_lon)},
{namespace:'plot',key:'cosmo_tokens',type:'number_integer',value:String(p.mf_cosmo_tokens)},
{namespace:'plot',key:'status',type:'single_line_text_field',value:p.mf_status},
{namespace:'plot',key:'sale_status',type:'single_line_text_field',value:p.mf_sale_status},
{namespace:'plot',key:'product_status',type:'single_line_text_field',value:p.mf_product_status},
...(p.mf_unlock_year?[{namespace:'plot',key:'unlock_year',type:'number_integer',value:String(p.mf_unlock_year)}]:[]),
]};
const SET=`mutation($input:ProductSetInput!){productSet(input:$input){product{id handle onlineStoreUrl}userErrors{field message}}}`;
const PUB=`mutation($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){userErrors{field message}}}`;
const MEDIA=`mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){userErrors{field message}}}`;
// KROK 1: import (productSet CREATE)
const rep={started:new Date().toISOString(),ok:[],failed:[]};
for(let i=0;i<batch.length;i+=5){
  const chunk=batch.slice(i,i+5);
  const res=await Promise.all(chunk.map(async p=>{
    try{
      const s=await gql(SET,{input:{handle:p.handle,title:p.title,vendor:p.vendor,productType:p.product_type,status:'ACTIVE',tags:p.tags.split(', '),productOptions:[{name:'Title',position:1,values:[{name:'Default'}]}],variants:[{sku:p.sku,price:String(p.price),optionValues:[{name:'Default',optionName:'Title'}],inventoryPolicy:'DENY',inventoryQuantities:[{locationId:LOCATION_ID,name:'available',quantity:p.inventory_quantity}]}],metafields:mf(p)}});
      const errs=s.data?.productSet?.userErrors;
      if(errs?.length)return {handle:p.handle,ok:false,step:'productSet',errors:errs};
      const prod=s.data.productSet.product;
      await gql(PUB,{id:prod.id,input:[{publicationId:PUBLICATION_ID}]});
      if(p.image_src)await gql(MEDIA,{productId:prod.id,media:[{originalSource:p.image_src,mediaContentType:'IMAGE'}]});
      return {handle:p.handle,ok:true};
    }catch(e){return {handle:p.handle,ok:false,step:'exception',errors:[{message:String(e).slice(0,150)}]};}
  }));
  res.forEach(r=>r.ok?rep.ok.push(r):rep.failed.push(r));
  fs.writeFileSync(`build/import-${NAME}-report.json`,JSON.stringify(rep,null,1));
  process.stdout.write(`\r[${rep.ok.length+rep.failed.length}/${batch.length}] ok=${rep.ok.length} fail=${rep.failed.length}`);
  await new Promise(s=>setTimeout(s,500));
}
console.log(`\nKROK1 ${NAME}: OK=${rep.ok.length} FAIL=${rep.failed.length}`);
rep.failed.slice(0,8).forEach(f=>console.log('  FAIL:',f.handle,f.step,JSON.stringify(f.errors||'').slice(0,120)));

if(FIX){
  console.log(`KROK2 ${NAME}: nadpisanie starych (z id) + brakujące...`);
  const byHandle={};manifest.forEach(p=>byHandle[p.handle]=p);
  const todo=rep.failed.filter(f=>byHandle[f.handle]);
  const fixRep={ok:[],failed:[]};
  for(let i=0;i<todo.length;i+=5){
    const chunk=todo.slice(i,i+5);
    const res=await Promise.all(chunk.map(async f=>{
      const p=byHandle[f.handle];
      try{
        const q=await gql(`query{products(first:1,query:"handle:${p.handle}"){nodes{id}}}`);
        const id=q.data.products.nodes[0]?.id;
        if(!id)return {handle:p.handle,ok:false,step:'noid'};
        const s=await gql(SET,{input:{id,handle:p.handle,title:p.title,vendor:p.vendor,productType:p.product_type,status:'ACTIVE',tags:p.tags.split(', '),productOptions:[{name:'Title',position:1,values:[{name:'Default'}]}],variants:[{sku:p.sku,price:String(p.price),optionValues:[{name:'Default',optionName:'Title'}],inventoryPolicy:'DENY',inventoryQuantities:[{locationId:LOCATION_ID,name:'available',quantity:p.inventory_quantity}]}],metafields:mf(p)}});
        const errs=s.data?.productSet?.userErrors;
        if(errs?.length)return {handle:p.handle,ok:false,step:'productSet',errors:errs};
        if(p.image_src)await gql(MEDIA,{productId:id,media:[{originalSource:p.image_src,mediaContentType:'IMAGE'}]});
        return {handle:p.handle,ok:true};
      }catch(e){return {handle:p.handle,ok:false,step:'exception',errors:[{message:String(e).slice(0,150)}]};}
    }));
    res.forEach(r=>r.ok?fixRep.ok.push(r):fixRep.failed.push(r));
    fs.writeFileSync(`build/fix-${NAME}-report.json`,JSON.stringify(fixRep,null,1));
    process.stdout.write(`\r[${fixRep.ok.length+fixRep.failed.length}/${todo.length}] ok=${fixRep.ok.length} fail=${fixRep.failed.length}`);
    await new Promise(s=>setTimeout(s,500));
  }
  console.log(`\nKROK2 ${NAME}: OK=${fixRep.ok.length} FAIL=${fixRep.failed.length}`);
  fixRep.failed.slice(0,8).forEach(f=>console.log('  FAIL:',f.handle,f.step,JSON.stringify(f.errors||'').slice(0,120)));
}
console.log(`DONE ${NAME}`);
