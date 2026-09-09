// fix-venus-50-override.mjs — nadpisanie 50 starych Venus (productSet z id) zeby sklep=mapa.
// Te 50 ma w Shopify STARE dane (nie nadpisały się przez productSet z samym handle).
// Tu: znajdź id po handle → productSet z id + pełne dane z nowego manifestu.
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const CLIENT_SECRET=t.match(/shpss_[A-Za-z0-9]+/)[0];
const CLIENT_ID=t.match(/\b[0-9a-f]{32}\b/)[0];
const LOCATION_ID='gid://shopify/Location/118795174229';
const PUBLICATION_ID='gid://shopify/Publication/337157751125';
// 50 stale ktore nie nadpisane (z fail importu) — te w manifeście
const rep=JSON.parse(fs.readFileSync('./build/import-venus-report.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('./build/venus-8000-manifest.json','utf8'));
const failH=rep.failed.filter(f=>f.step==='productSet').map(f=>f.handle);
const manifestByHandle={};manifest.forEach(p=>manifestByHandle[p.handle]=p);
const todo=failH.filter(h=>manifestByHandle[h]);
console.log('do nadpisania (z id):',todo.length);
// token
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
const SET=`mutation($input:ProductSetInput!){productSet(input:$input){product{id handle}userErrors{field message}}}`;
const MEDIA=`mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){userErrors{field message}}}`;
const report={ok:[],failed:[]};
for(let i=0;i<todo.length;i+=5){const chunk=todo.slice(i,i+5);const res=await Promise.all(chunk.map(async handle=>{
  const p=manifestByHandle[handle];
  try{
    const q=await gql(`query{products(first:1,query:"handle:${handle}"){nodes{id}}}`);
    const id=q.data.products.nodes[0]?.id;
    if(!id)return {handle,ok:false,step:'noid'};
    const s=await gql(SET,{input:{id,handle:p.handle,title:p.title,vendor:p.vendor,productType:p.product_type,status:'ACTIVE',tags:p.tags.split(', '),productOptions:[{name:'Title',position:1,values:[{name:'Default'}]}],variants:[{sku:p.sku,price:String(p.price),optionValues:[{name:'Default',optionName:'Title'}],inventoryPolicy:'DENY',inventoryQuantities:[{locationId:LOCATION_ID,name:'available',quantity:p.inventory_quantity}]}],metafields:mf(p)}});
    const errs=s.data?.productSet?.userErrors;
    if(errs?.length)return {handle,ok:false,step:'productSet',errors:errs};
    if(p.image_src){await gql(MEDIA,{productId:id,media:[{originalSource:p.image_src,mediaContentType:'IMAGE'}]});}
    return {handle,ok:true};
  }catch(e){return {handle,ok:false,step:'exception',errors:[{message:String(e).slice(0,150)}]};}
}));
  res.forEach(r=>r.ok?report.ok.push(r):report.failed.push(r));
  fs.writeFileSync('build/fix-venus-50-report.json',JSON.stringify(report,null,1));
  console.log(`[${report.ok.length+report.failed.length}/${todo.length}] ok=${report.ok.length} fail=${report.failed.length}`);
  await new Promise(s=>setTimeout(s,500));
}
console.log(`\nOK=${report.ok.length} FAIL=${report.failed.length}`);
report.failed.slice(0,8).forEach(f=>console.log('FAIL:',f.handle,f.step,JSON.stringify(f.errors||'').slice(0,120)));
