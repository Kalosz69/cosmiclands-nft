// RETRY K2 — tylko rekordy z fail w build/k2-import-report.json (throttle na końcu batcha 06.09).
// Bezpiecznik: przed productCreateMedia sprawdza featuredMedia (zapobiega duplikatom obrazów
// przy re-importcie istniejącego produktu) — lekcja z pełnego re-runu, której unikamy.
// productSet = upsert po handle (idempotentny co do pól; nie dotyka media).
import fs from 'node:fs';

const SHOP = 'rzkhvb-m1.myshopify.com';
const LOCATION_ID = 'gid://shopify/Location/118795174229';
const PUBLICATION_ID = 'gid://shopify/Publication/337157751125';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:t.match(/\b[0-9a-f]{32}\b/)[0], client_secret:t.match(/shpss_[A-Za-z0-9]+/)[0], grant_type:'client_credentials'}),
});
const TOKEN = (await tr.json()).access_token;
if (!TOKEN) { console.log('TOKEN FAIL'); process.exit(1); }

const gql = async (q, v={}) => {
  for (let a=0; a<6; a++) {
    const res = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
      body: JSON.stringify({query:q, variables:v})
    });
    if (res.status===429 || res.status===502){ await new Promise(s=>setTimeout(s,3000*(a+1))); continue; }
    const j = await res.json();
    if (j.errors && !j.data) { await new Promise(s=>setTimeout(s,3000*(a+1))); continue; } // GraphQL throttle
    return j;
  }
  throw new Error('gql: wyczerpane retry');
};

const manifest = JSON.parse(fs.readFileSync('build/k2-manifest.json','utf8'));
const report = JSON.parse(fs.readFileSync('build/k2-import-report.json','utf8'));
const failedHandles = new Set(report.failed.map(f => f.handle));
const todo = manifest.filter(p => failedHandles.has(p.handle));
console.log(`retry: ${todo.length} rekordów: ${[...failedHandles].join(', ')}`);

const SET = `mutation($input: ProductSetInput!) { productSet(input: $input) { product { id handle publishedAt } userErrors { field message } } }`;
const PUB = `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`;
const MEDIA = `mutation($productId: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $productId, media: $media) { media { id } mediaUserErrors { field message } } }`;
const LOOKUP = `query($h: String!) { products(first: 1, query: $h) { nodes { id featuredMedia { id } } } }`;

function plotMetafields(p) {
  return [
    { namespace:'plot', key:'plot_id',        type:'single_line_text_field', value:p.mf_plot_id },
    { namespace:'plot', key:'planet',         type:'single_line_text_field', value:p.mf_planet },
    { namespace:'plot', key:'region',         type:'single_line_text_field', value:p.mf_region },
    { namespace:'plot', key:'region_id',      type:'single_line_text_field', value:p.mf_region_id },
    { namespace:'plot', key:'region_name',    type:'single_line_text_field', value:p.mf_region_name },
    { namespace:'plot', key:'class',          type:'single_line_text_field', value:p.mf_class },
    { namespace:'plot', key:'area_ha',        type:'number_decimal',         value:String(p.mf_area_ha) },
    { namespace:'plot', key:'price_eur',      type:'number_decimal',         value:String(p.mf_price_eur) },
    { namespace:'plot', key:'coordinates_lat',type:'number_decimal',         value:String(p.mf_coordinates_lat) },
    { namespace:'plot', key:'coordinates_lon',type:'number_decimal',         value:String(p.mf_coordinates_lon) },
    { namespace:'plot', key:'cosmo_tokens',   type:'number_integer',         value:String(p.mf_cosmo_tokens) },
    { namespace:'plot', key:'status',         type:'single_line_text_field', value:p.mf_status },
    { namespace:'plot', key:'sale_status',    type:'single_line_text_field', value:p.mf_sale_status },
    { namespace:'plot', key:'product_status', type:'single_line_text_field', value:p.mf_product_status },
  ];
}

const rr = { ok:[], failed:[] };
for (const p of todo) {
  try {
    const look = await gql(LOOKUP, { h: `handle:${p.handle}` });
    const existing = look.data?.products?.nodes?.[0] ?? null;
    if (existing) console.log(`${p.handle}: już istnieje (id ${existing.id}) — upsert + media-guard`);

    const setRes = await gql(SET, { input: {
      handle: p.handle, title: p.title, vendor: p.vendor, productType: p.product_type,
      status: 'ACTIVE', tags: p.tags.split(', '),
      productOptions: [{ name:'Title', position:1, values:[{name:'Default'}] }],
      variants: [{ sku: p.sku, price: String(p.price), optionValues: [{ name:'Default', optionName:'Title' }],
        inventoryPolicy: 'DENY',
        inventoryQuantities: [{ locationId: LOCATION_ID, name:'available', quantity: p.inventory_quantity }] }],
      metafields: plotMetafields(p),
    }});
    const errs = setRes.data?.productSet?.userErrors;
    if (errs?.length) { rr.failed.push({ handle:p.handle, step:'productSet', errors:errs }); continue; }
    const product = setRes.data.productSet.product;

    const pubRes = await gql(PUB, { id: product.id, input: [{ publicationId: PUBLICATION_ID }] });
    const pubErrs = pubRes.data?.publishablePublish?.userErrors;
    if (pubErrs?.length) { rr.failed.push({ handle:p.handle, step:'publish', errors:pubErrs }); continue; }

    // media tylko gdy produkt nie ma obrazu (guard anty-duplikat)
    const relook = await gql(LOOKUP, { h: `handle:${p.handle}` });
    const hasMedia = !!relook.data?.products?.nodes?.[0]?.featuredMedia;
    if (p.image_src && !hasMedia) {
      await gql(MEDIA, { productId: product.id, media: [{ originalSource: p.image_src, mediaContentType: 'IMAGE' }] });
    }
    rr.ok.push({ handle:p.handle, existed: !!existing, mediaSkipped: hasMedia });
    console.log(`OK: ${p.handle} (existed=${!!existing}, mediaSkipped=${hasMedia})`);
  } catch(e) {
    rr.failed.push({ handle:p.handle, step:'exception', errors:[{message:String(e).slice(0,200)}] });
    console.log(`FAIL: ${p.handle} ${String(e).slice(0,120)}`);
  }
  await new Promise(s=>setTimeout(s,1200)); // spokojniejsze pacing po throttle
}
fs.writeFileSync('build/k2-retry-report.json', JSON.stringify(rr,null,1));
console.log(`RETRY DONE: OK=${rr.ok.length} FAIL=${rr.failed.length}`);
