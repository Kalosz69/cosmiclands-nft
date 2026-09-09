// check-one-readonly.mjs — trzeci, minimalny odczyt: featuredMedia dla 5 konkretnych handle'ów
// Read-only. Rozstrzyga sprzeczność: inwentaryzacja 01:11 mówiła 411/426 z featuredMedia,
// odczyt 2 mówił tylko 33/426. ZERO mutacji.
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:`{ products(first:8, query:"handle:mars-plot-000001 OR handle:mars-plot-000034 OR handle:pluto-plot-000001 OR handle:mars-plot-000555 OR handle:mars-plot-000011"){ nodes{ handle featuredMedia{ ...on MediaImage{ image{ url } } } media(first:5){ nodes{ id } } } } }`})});
const j=await res.json();
if(j.errors){ console.error('GraphQL errors:', JSON.stringify(j.errors).slice(0,300)); process.exit(1); }
for(const p of j.data.products.nodes){
  const fname=p.featuredMedia?.image?.url ? p.featuredMedia.image.url.split('/').pop().split('?')[0] : null;
  console.log(p.handle, '| featured:', fname||'NULL', '| media nodes:', p.media.nodes.length);
}
console.log('znaleziono produktów:', j.data.products.nodes.length, 'z 5 szukanych');
