// PROBE pluto-plot-10002: rozstrzyga semantykę productSet przy UPDATE.
// Wysyła PEŁNY zestaw 13 metafieldów (nigdy częściowy!): unlock_year po id, reszta ns/key.
// Wszystkie wartości z manifestu — produkt końcowo poprawny pod każdą semantyką.
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:id, client_secret:secret, grant_type:'client_credentials'}),
});
const TOKEN = (await r.json()).access_token;
const gql = async (q,v={}) => (await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
  method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body: JSON.stringify({query:q,variables:v})
})).json();

const H = 'pluto-plot-10002';
const mfAll = JSON.parse(fs.readFileSync('build/new480-manifest.json','utf8'));
const rec = mfAll.find(x => x.handle === H);
if (!rec) throw new Error('brak rekordu w manifeście');

const ns = 'plot';
const before = await gql(`query($h:String!){ productByHandle(handle:$h){ id metafields(first:50){nodes{id key value}} } }`, {h:H});
const p = before.data.productByHandle;
const uyId = p.metafields.nodes.find(n=>n.key==='unlock_year')?.id;
console.log('BEFORE: metafieldów =', p.metafields.nodes.length, '| unlock_year =', p.metafields.nodes.find(n=>n.key==='unlock_year')?.value, '| mfId =', uyId);

const entries = [];
if (uyId) entries.push({ id: uyId, value: String(rec.mf_unlock_year) });
for (const [key, type, val] of [
  ['plot_id','single_line_text_field',rec.mf_plot_id],
  ['planet','single_line_text_field',rec.mf_planet],
  ['region','single_line_text_field',rec.mf_region],
  ['class','single_line_text_field',rec.mf_class],
  ['area_ha','number_decimal',rec.mf_area_ha],
  ['price_eur','number_decimal',rec.mf_price_eur],
  ['coordinates_lat','number_decimal',rec.mf_coordinates_lat],
  ['coordinates_lon','number_decimal',rec.mf_coordinates_lon],
  ['cosmo_tokens','number_integer',rec.mf_cosmo_tokens],
  ['status','single_line_text_field',rec.mf_status],
  ['sale_status','single_line_text_field',rec.mf_sale_status],
  ['product_status','single_line_text_field',rec.mf_product_status],
]) entries.push({ namespace: ns, key, type, value: String(val ?? '') });

const res = await gql(`mutation($input: ProductSetInput!){ productSet(input:$input){ product{id} userErrors{field message} } }`, {input:{id: p.id, metafields: entries}});
console.log('userErrors:', JSON.stringify(res.data?.productSet?.userErrors ?? res));

const after = await gql(`query($h:String!){ productByHandle(handle:$h){ metafields(first:50){nodes{key value}} } }`, {h:H});
const nodes = after.data.productByHandle.metafields.nodes;
const uy = nodes.filter(n=>n.key==='unlock_year');
console.log('AFTER: metafieldów =', nodes.length, '| unlock_year x', uy.length, '=', uy.map(n=>n.value).join(','));
console.log('VERDICT:', nodes.length===13 && uy.length===1 ? 'PELNY-ZESTAW-13-OK (replace lub overwrite)' : (nodes.length>13 ? 'DUPLIKATY (ns/key tworzy nowe)' : 'CZESCIOWO (ns/key zignorowane)'));