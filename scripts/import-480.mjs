// IMPORT-480: import 480 nowych działek do Shopify przez Admin API (productSet, jak w workerze).
// Partie po 30, pauza 1s, BEZ publish (ACTIVE + niepublikowane — zasada 15-biblia §6.1).
// Raport: build/import480-report.json
import fs from 'node:fs';

const PLOT = JSON.parse(fs.readFileSync('build/new480-manifest.json', 'utf8'));
const shop = { domain: 'rzkhvb-m1.myshopify.com' };
{
  const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
  const mSecret = t.match(/shpss_[A-Za-z0-9]+/);
  const mId = t.match(/\b[0-9a-f]{32}\b/);
  shop.clientSecret = mSecret ? mSecret[0] : null;
  shop.clientId = mId ? mId[0] : null;
}
if (!shop.clientSecret || !shop.clientId) throw new Error('brak creds w shop.txt');
const LOCATION_ID = 'gid://shopify/Location/118795174229';

let TOKEN = null;
async function oauth() {
  const body = JSON.stringify({client_id: shop.clientId, client_secret: shop.clientSecret, grant_type: 'client_credentials'});
  const r = await fetch(`https://${shop.domain}/admin/oauth/access_token`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body,
  });
  if (!r.ok) throw new Error(`OAuth fail: ${r.status} ${(await r.text()).slice(0,150)}`);
  TOKEN = (await r.json()).access_token;
}
async function gql(query, variables) {
  const r = await fetch(`https://${shop.domain}/admin/api/2026-07/graphql.json`, {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'X-Shopify-Access-Token': TOKEN},
    body: JSON.stringify({query, variables}),
  });
  if (r.status === 429) { await new Promise(s=>setTimeout(s,3000)); return gql(query, variables); }
  return r.json();
}

const MUT = `mutation productSet($input: ProductSetInput!) {
  productSet(input: $input) {
    product { id handle }
    userErrors { field message }
  }
}`;

// LOOKUP po handle: istnieje -> productSet z id = UPDATE (nadpisze metafieldy z poprawnym rokiem).
// Fix importu 480 (noc 01/02.09): bez id productSet failuje "Handle already in use" (~420 SKU zlych lat).
const LOOKUP = `query($h:String!){ productByHandle(handle:$h){ id } }`;

function mf(namespace, key, type, value) {
  return { namespace, key, type, value: String(value ?? '') };
}
function productInput(p) {
  return {
    title: p.title, handle: p.handle, vendor: p.vendor, productType: 'Land Plot',
    status: 'ACTIVE',
    tags: (p.tags||'').split(',').map(t=>t.trim()).filter(Boolean),
    productOptions: [{ name: 'Title', position: 1, values: [{ name: 'Default' }] }],
    variants: [{
      sku: p.sku, price: String(p.price),
      optionValues: [{ name: 'Default', optionName: 'Title' }],
      inventoryPolicy: 'DENY',
      inventoryQuantities: [{ locationId: LOCATION_ID, name: 'available', quantity: 1 }],
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
// ONLY=<handle> — przetwórz tylko ten produkt (probe/test jednego przed pełnym biegiem)
const plots = process.env.ONLY ? PLOT.filter(r => r.handle === process.env.ONLY) : PLOT;
if (process.env.ONLY && plots.length === 0) throw new Error(`ONLY: nie ma handle ${process.env.ONLY} w manifeście`);
const report = { started: new Date().toISOString(), ok: [], failed: [], updated: 0, created: 0 };
for (let i = 0; i < plots.length; i += 30) {
  const batch = plots.slice(i, i+30);
  for (const p of batch) {
    try {
      const lk = await gql(LOOKUP, { h: p.handle });
      const pid = lk?.data?.productByHandle?.id ?? null;
      const input = productInput(p);
      if (pid) { input.id = pid; delete input.variants; } // UPDATE: tylko metafieldy, bez dotykania wariantów
      const res = await gql(MUT, { input });
      const ps = res?.data?.productSet;
      if (ps?.product) { report.ok.push(p.sku); pid ? report.updated++ : report.created++; }
      else report.failed.push({ sku: p.sku, errors: ps?.userErrors ?? res });
    } catch (e) {
      report.failed.push({ sku: p.sku, errors: [{ message: String(e).slice(0,200) }] });
    }
    await new Promise(s=>setTimeout(s, 350));
  }
  fs.writeFileSync('build/import480-report.json', JSON.stringify(report, null, 1));
  console.log(`[${Math.min(i+30, plots.length)}/${plots.length}] ok=${report.ok.length} fail=${report.failed.length}`);
}
console.log(`\nKONIEC: ok=${report.ok.length} (updated=${report.updated}, created=${report.created}) fail=${report.failed.length}`);
