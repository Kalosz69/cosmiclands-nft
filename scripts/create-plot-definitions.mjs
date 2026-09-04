// KROK 1 TESTU: definicje plot.* (wg CSV sierpień = nagłówki Matrixify, read z K 02.09).
// Addytywne, odwracalne (definicje można usunąć). Bez nich edytor nie pokazuje danych.
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
let TOKEN;
const oauth = async () => {
  const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({client_id: id, client_secret: secret, grant_type: 'client_credentials'}),
  });
  TOKEN = (await r.json()).access_token;
};
await oauth();
const gql = async (query, variables = {}) => {
  const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'X-Shopify-Access-Token': TOKEN},
    body: JSON.stringify({query, variables}),
  });
  return r.json();
};
const DEFS = [
  ['plot_id','single_line_text_field','Plot ID'],
  ['planet','single_line_text_field','Planet'],
  ['region','single_line_text_field','Region'],
  ['region_id','single_line_text_field','Region ID'],
  ['region_name','single_line_text_field','Region Name'],
  ['class','single_line_text_field','Class'],
  ['area_ha','number_decimal','Area (ha)'],
  ['price_eur','number_decimal','Price EUR'],
  ['coordinates_lat','number_decimal','Latitude'],
  ['coordinates_lon','number_decimal','Longitude'],
  ['cosmo_tokens','number_integer','COSMO Tokens'],
  ['status','single_line_text_field','Status'],
  ['sale_status','single_line_text_field','Sale Status'],
  ['product_status','single_line_text_field','Product Status'],
  ['unlock_year','number_integer','Unlock Year'],
];
let created = 0, exists = 0, failed = 0;
for (const [key, type, name] of DEFS) {
  const res = await gql(`mutation($d: MetafieldDefinitionInput!){ metafieldDefinitionCreate(definition: $d){ createdDefinition{ id } userErrors{ field message code } } }`, {
    d: { name: `Plot ${key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}`, namespace: 'plot', key, ownerType: 'PRODUCT', type, description: `Cosmic Lands plot data (${key})` },
  });
  const errs = res?.data?.metafieldDefinitionCreate?.userErrors ?? [];
  if (res?.data?.metafieldDefinitionCreate?.createdDefinition) created++;
  else if (errs.some(e => e.code === 'TAKEN')) exists++;
  else { failed++; console.log('FAIL', key, JSON.stringify(errs)); }
}
console.log(`DEFINICJE plot.*: created=${created} already-exists=${exists} failed=${failed}`);
