// IMPORT VENUS (Shopify CREATE/UPSERT) — pełny katalog Venus z build/venus-8000-manifest.json
// Wzorzec: import-k-batch.mjs (lekcja #1: osobny wariant, twardy limit, osobny raport).
// productSet (upsert po handle) NADPISUJE istniejące stare Venus (te same handle), NIE rusza
// sprzedanych 000001/001233 (brak ich w manifeście). Domyślnie N=8000. Raport: build/import-venus-report.json
import fs from 'node:fs';
const SHOP='rzkhvb-m1.myshopify.com';
const LOCATION_ID='gid://shopify/Location/118795174229';
const PUBLICATION_ID='gid://shopify/Publication/337157751125';
const N=parseInt(process.argv[2]||'8000',10);
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const CLIENT_ID=t.match(/\b[0-9a-f]{32}\b/)[0];
const CLIENT_SECRET=t.match(/shpss_[A-Za-z0-9]+/)[0];
const tr=await fetch(`https://${SHOP}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'client_credentials'})});
const TOKEN=(await tr.json()).access_token;
if(!TOKEN){console.log('TOKEN FAIL');process.exit(1);}
const gql=async(q,v={})=>{for(;;){const res=await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};
const manifest=JSON.parse(fs.readFileSync('/opt/data/workspace/cosmiclands-nft/build/venus-8000-manifest.json','utf8'));
const batch=manifest.slice(0,N);
console.log(`import Venus: ${batch.length} działek (venus-8000-manifest.json 1–${N})`);
const SET=`mutation($input: ProductSetInput!){ productSet(input:$input){ product{ id handle onlineStoreUrl publishedAt } userErrors{ field message } } }`;
const PUB=`mutation($id: ID!, $input:[PublicationInput!]!){ publishablePublish(id:$id, input:$input){ userErrors{ field message } } }`;
const MEDIA=`mutation($productId: ID!, $media:[CreateMediaInput!]!){ productCreateMedia(productId:$productId, media:$media){ userErrors{ field message } } }`;
function plotMetafields(p){
  return [
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
  ];
}
const report={started:new Date().toISOString(),ok:[],failed:[]};
for(let i=0;i<batch.length;i+=5){
  const chunk=batch.slice(i,i+5);
  const results=await Promise.all(chunk.map(async p=>{
    try{
      const setRes=await gql(SET,{input:{handle:p.handle,title:p.title,vendor:p.vendor,productType:p.product_type,status:'ACTIVE',tags:p.tags.split(', '),productOptions:[{name:'Title',position:1,values:[{name:'Default'}]}],variants:[{sku:p.sku,price:String(p.price),optionValues:[{name:'Default',optionName:'Title'}],inventoryPolicy:'DENY',inventoryQuantities:[{locationId:LOCATION_ID,name:'available',quantity:p.inventory_quantity}]}],metafields:plotMetafields(p)}});
      const errs=setRes.data?.productSet?.userErrors;
      if(errs?.length)return{handle:p.handle,ok:false,step:'productSet',errors:errs};
      const product=setRes.data.productSet.product;
      const pubRes=await gql(PUB,{id:product.id,input:[{publicationId:PUBLICATION_ID}]});
      if(pubRes.data?.publishablePublish?.userErrors?.length)return{handle:p.handle,ok:false,step:'publish',errors:pubRes.data.publishablePublish.userErrors};
      if(p.image_src){await gql(MEDIA,{productId:product.id,media:[{originalSource:p.image_src,mediaContentType:'IMAGE'}]});}
      return{handle:p.handle,ok:true,publishedAt:product.publishedAt??null,url:product.onlineStoreUrl??null};
    }catch(e){return{handle:p.handle,ok:false,step:'exception',errors:[{message:String(e).slice(0,200)}]};}
  }));
  for(const r of results)r.ok?report.ok.push(r):report.failed.push(r);
  fs.writeFileSync('build/import-venus-report.json',JSON.stringify(report,null,1));
  process.stdout.write(`\r${report.ok.length+report.failed.length}/${batch.length}`);
  await new Promise(s=>setTimeout(s,500));
}
console.log(`\nOK=${report.ok.length} FAIL=${report.failed.length}`);
for(const f of report.failed)console.log('FAIL:',f.handle,f.step,JSON.stringify(f.errors).slice(0,180));
