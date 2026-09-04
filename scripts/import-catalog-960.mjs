// FAZA 3 — IMPORT-960: CREATE wszystkich działek z build/catalog960-canonical-manifest.json (czysty sklep).
// productSet CREATE, partie 30, pacing 350ms, BEZ publish (zasada 15-biblia §6.1).
// Resumable: pomija SKU już w ok raporcie. Raport: build/import960-report.json
import fs from 'node:fs';
const PLOT = JSON.parse(fs.readFileSync('build/catalog960-canonical-manifest.json','utf8'));
const shop = { domain:'rzkhvb-m1.myshopify.com' };
{
  const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
  shop.clientSecret = t.match(/shpss_[A-Za-z0-9]+/)[0];
  shop.clientId = t.match(/\b[0-9a-f]{32}\b/)[0];
}
if (!shop.clientSecret || !shop.clientId) throw new Error('brak creds w shop.txt');
const LOCATION_ID = 'gid://shopify/Location/118795174229';

let TOKEN = null;
async function oauth() {
  const body = JSON.stringify({client_id:shop.clientId, client_secret:shop.clientSecret, grant_type:'client_credentials'});
  const r = await fetch(`https://${shop.domain}/admin/oauth/access_token`, {method:'POST', headers:{'Content-Type':'application/json'}, body});
  if (!r.ok) throw new Error(`OAuth fail: ${r.status} ${(await r.text()).slice(0,150)}`);
  TOKEN = (await r.json()).access_token;
}
async function gql(query, variables) {
  for (;;) {
    const r = await fetch(`https://${shop.domain}/admin/api/2026-07/graphql.json`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body: JSON.stringify({query, variables}),
    });
    if (r.status===429){ await new Promise(s=>setTimeout(s,3000)); continue; }
    return r.json();
  }
}
const MUT = `mutation productSet($input: ProductSetInput!) {
  productSet(input: $input) { product { id handle } userErrors { field message } }
}`;
function mf(namespace, key, type, value) { return {namespace, key, type, value: String(value ?? '')}; }
function productInput(p) {
  return {
    title: p.title, handle: p.handle, vendor: p.vendor, productType: 'Land Plot',
    status: 'ACTIVE',
    tags: (p.tags||'').split(',').map(t=>t.trim()).filter(Boolean),
    productOptions: [{ name:'Title', position:1, values:[{name:'Default'}] }],
    variants: [{
      sku: p.sku, price: String(p.price),
      optionValues: [{ name:'Default', optionName:'Title' }],
      inventoryPolicy: 'DENY',
      inventoryQuantities: [{ locationId: LOCATION_ID, name:'available', quantity: 1 }],
    }],
    metafields: [
      mf('plot','plot_id','single_line_text_field',p.mf_plot_id),
      mf('plot','planet','single_line_text_field',p.mf_planet),
      mf('plot','region','single_line_text_field',p.mf_region),
      mf('plot','class','single_line_text_field',p.mf_class),
      mf('plot','area_ha','number_decimal',p.mf_area_ha),
      mf('plot','price_eur','number_decimal',p.mf_price_eur),
      mf('plot','coordinates_lat','number_decimal',p.mf_coordinates_lat),
      mf('plot','coordinates_lon','number_decimal',p.mf_coordinates_lon),
      mf('plot','cosmo_tokens','number_integer',p.mf_cosmo_tokens),
      mf('plot','status','single_line_text_field',p.mf_status),
      mf('plot','sale_status','single_line_text_field',p.mf_sale_status),
      mf('plot','product_status','single_line_text_field','active'),
      mf('plot','unlock_year','number_integer',p.mf_unlock_year),
    ],
  };
}

await oauth();
const report = fs.existsSync('build/import960-report.json') ? JSON.parse(fs.readFileSync('build/import960-report.json','utf8')) : {started:new Date().toISOString(), ok:[], failed:[]};
const doneSkus = new Set(report.ok);
const todo = PLOT.filter(p=>!report.ok.includes(p.sku));
console.log(`do importu: ${todo.length}/${PLOT.length}`);
for (let i=0;i<todo.length;i+=30) {
  const batch = todo.slice(i,i+30);
  for (const p of batch) {
    try {
      const res = await gql(MUT, {input: productInput(p)});
      const ps = res?.data?.productSet;
      if (ps?.product) report.ok.push(p.sku);
      else report.failed.push({sku:p.sku, errors: ps?.userErrors ?? res});
    } catch(e) { report.failed.push({sku:p.sku, errors:[{message:String(e).slice(0,200)}]}); }
    fs.writeFileSync('build/import960-report.json', JSON.stringify(report,null,1));
    process.stdout.write(`\r${report.ok.length}/${PLOT.length} ok, fail=${report.failed.length}`);
    await new Promise(s=>setTimeout(s,350));
  }
}
console.log(`\nKONIEC: ok=${report.ok.length} fail=${report.failed.length}`);