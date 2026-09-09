// build-kv-mars-8004.mjs — buduje manifest KV z mars-8000-manifest.json (po imporcie)
// Wzorzec: build-kv-k2.mjs. Użycie PO zakończeniu importu, przed push-kv.
import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('build/mars-8000-manifest.json','utf8'));
const kv=[];
for(const r of m){
  const live={} // TODO: po imporcie dociągnij live (id/featuredMedia) albo użyj pola z manifestu
  kv.push({
    handle:r.handle, plot_id:r.plot_id, plot_number:r.plot_number, sku:r.sku, title:r.title,
    price:r.price, inventory_quantity:1, inventory_policy:'deny',
    image_src:r.image_src,
    planet:'mars', region:r.mf_region_name, region_code:r.mf_region_id, region_id:r.mf_region_id,
    mf_plot_id:r.mf_plot_id, mf_planet:'mars', mf_region:r.mf_region_name,
    mf_region_id:r.mf_region_id, mf_region_name:r.mf_region_name, mf_class:r.mf_class,
    mf_coordinates_lat:r.mf_coordinates_lat, mf_coordinates_lon:r.mf_coordinates_lon,
    mf_cosmo_tokens:r.mf_cosmo_tokens, mf_area_ha:r.mf_area_ha, mf_price_eur:r.mf_price_eur,
    mf_status:r.mf_status, mf_sale_status:r.mf_sale_status, mf_product_status:r.mf_product_status,
    lat:r.lat, lon:r.lon, unlock_year:r.mf_unlock_year||null, variant_id:null,
  });
}
fs.writeFileSync('build/kv-mars-8004.json',JSON.stringify(kv,null,1));
console.log('KV manifest:',kv.length,'| sold:',kv.filter(x=>x.mf_sale_status==='sold').length);