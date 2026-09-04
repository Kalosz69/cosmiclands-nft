// PROBE 1 SZTUKI: mars-plot-000001 — pełny zestaw wg K (plot.* 15 + custom.* 8)
// CREATE (sklep pusty), productSet, bez publish. Wartości custom.* z danych działki;
// hotspot_image_id(_2)/prestige = puste (brak źródła w danych — odnotowane w karcie).
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const cid = t.match(/[0-9a-f]{32}/)[0];
const tok = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})}).then(r=>r.json());
const H = {'Content-Type':'application/json','X-Shopify-Access-Token':tok.access_token};
const EP = 'https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json';
const gql = (q,v)=>fetch(EP,{method:'POST',headers:H,body:JSON.stringify({query:q,variables:v})}).then(r=>r.json());

const M = JSON.parse(fs.readFileSync('/opt/data/workspace/cosmiclands-nft/build/catalog960-canonical-manifest.json','utf8'));
const p = M.find(x=>x.handle==='mars-plot-000001');
if(!p){console.log('BRAK w manifeście');process.exit(1);}
console.log('PROBE:', p.handle, '|', p.mf_class, '|', p.mf_region_name, '| unlock', p.mf_unlock_year);

const mf = [
  // plot.* — 15 (silnik)
  {namespace:'plot',key:'plot_id',type:'single_line_text_field',value:String(p.mf_plot_id)},
  {namespace:'plot',key:'planet',type:'single_line_text_field',value:String(p.mf_planet)},
  {namespace:'plot',key:'region',type:'single_line_text_field',value:String(p.mf_region)},
  {namespace:'plot',key:'region_id',type:'single_line_text_field',value:String(p.mf_region_id)},
  {namespace:'plot',key:'region_name',type:'single_line_text_field',value:String(p.mf_region_name)},
  {namespace:'plot',key:'class',type:'single_line_text_field',value:String(p.mf_class)},
  {namespace:'plot',key:'area_ha',type:'number_decimal',value:String(p.mf_area_ha)},
  {namespace:'plot',key:'price_eur',type:'number_decimal',value:String(p.mf_price_eur)},
  {namespace:'plot',key:'coordinates_lat',type:'number_decimal',value:String(p.mf_coordinates_lat)},
  {namespace:'plot',key:'coordinates_lon',type:'number_decimal',value:String(p.mf_coordinates_lon)},
  {namespace:'plot',key:'cosmo_tokens',type:'number_integer',value:String(p.mf_cosmo_tokens)},
  {namespace:'plot',key:'status',type:'single_line_text_field',value:String(p.mf_status)},
  {namespace:'plot',key:'sale_status',type:'single_line_text_field',value:String(p.mf_sale_status)},
  {namespace:'plot',key:'unlock_year',type:'number_integer',value:String(p.mf_unlock_year)},
  {namespace:'plot',key:'product_status',type:'single_line_text_field',value:String(p.mf_product_status)},
  // custom.* — 8 (theme/edytor); wartości z danych; hotspot/prestige bez źródła = puste
  {namespace:'custom',key:'zone_name',type:'single_line_text_field',value:String(p.mf_region_name)},
  {namespace:'custom',key:'class',type:'single_line_text_field',value:String(p.mf_class)},
  {namespace:'custom',key:'ha',type:'single_line_text_field',value:String(p.mf_area_ha)},
  {namespace:'custom',key:'cosmo',type:'single_line_text_field',value:String(p.mf_cosmo_tokens)},
  {namespace:'custom',key:'coordinates',type:'single_line_text_field',value:`${p.mf_coordinates_lat},${p.mf_coordinates_lon}`},
];
const q = `mutation($input:ProductSetInput!){productSet(input:$input){product{id handle status publishedOnCurrentPublication variants(first:1){nodes{sku price}}}
 userErrors{field message}}}`;
const input = {
  title:p.title, handle:p.handle, vendor:'Cosmic Lands', productType:'Land Plot',
  status:'ACTIVE', tags:(p.tags||'').split(',').map(s=>s.trim()).filter(Boolean),
  descriptionHtml:p.body_html||'',
  seo:{title:(p.seo_title||p.title).slice(0,70), description:(p.seo_description||'').slice(0,150)},
  productOptions:[{name:'Title',position:1,values:[{name:'Default'}]}],
  variants:[{sku:p.sku,price:String(p.price),optionValues:[{name:'Default',optionName:'Title'}],
    inventoryPolicy:'DENY',
    inventoryQuantities:[{locationId:'gid://shopify/Location/118795174229',name:'available',quantity:1}]}],
  metafields: mf,
  files: p.image_src ? [{originalSource:p.image_src,contentType:'IMAGE',alt:p.title}] : undefined,
};
const r = await gql(q,{input});
if(!r.data){console.log('ERR:',JSON.stringify(r).slice(0,400));process.exit(1);}
const ps = r.data.productSet;
console.log('userErrors:',JSON.stringify(ps.userErrors));
const prod = ps.product ?? {};
console.log('productSet product:', JSON.stringify(prod));
console.log('metafields zapisane:',prod.metafields?.nodes?.length);
fs.writeFileSync('/opt/data/workspace/cosmiclands-nft/build/probe1-readback.json',JSON.stringify(prod,null,1));
