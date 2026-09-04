// GEN-480: 60 nowych działek na każdą z 8 planet (blok 010001-010060).
// Klasy 15x S/M/L/XL, ceny/COSMO/area jak w kanonie, regiony+coords z bbox istniejących 60.
// Wyjście: build/new480-manifest.json + build/new480-catalog.csv (jeden CSV)
import fs from 'node:fs';

const mf = JSON.parse(fs.readFileSync('all-planets-manifest-v3.json', 'utf8'));
const PLANETS = [...new Set(mf.map(r => r.mf_planet))];
const META = {
  S:{area:'0.5', price:'50.00', cosmo:100}, M:{area:'1.5', price:'129.00', cosmo:300},
  L:{area:'4.5', price:'369.00', cosmo:900}, XL:{area:'13.5', price:'999.00', cosmo:2700},
};
const CLASSES = ['S','M','L','XL'];

// bbox per (planet, region) z istniejących danych
const bbox = {};
for (const r of mf) {
  const k = `${r.mf_planet}|${r.mf_region_name}`;
  bbox[k] ??= { latMin:+r.lat, latMax:+r.lat, lonMin:+r.lon, lonMax:+r.lon, rid:r.mf_region_id };
  const b = bbox[k];
  b.latMin = Math.min(b.latMin, +r.lat); b.latMax = Math.max(b.latMax, +r.lat);
  b.lonMin = Math.min(b.lonMin, +r.lon); b.lonMax = Math.max(b.lonMax, +r.lon);
}
// unlock_year — kanon 13-tokenomika-v3 (K 31.08 + K): 7 planet wg odległości od Słońca
// dostaje okna kolejno 10,15,20,25,30,35,40 lat; Pluto WYŁĄCZNIE 100 lat. Start=2026 (vault 2036 = 10 lat).
const UNLOCK = { mercury: 2036, venus: 2041, mars: 2046, jupiter: 2051, saturn: 2056, uranus: 2061, neptune: 2066, pluto: 2126 };

const rnd = (() => { let s = 0x5f4801; return () => { s = (s*1103515245+12345)>>>0; return s/4294967296; }; })();

const out = [];
for (const planet of PLANETS) {
  const regions = [...new Set(mf.filter(r => r.mf_planet === planet).map(r => r.mf_region_name))];
  const P = planet.toUpperCase();
  for (let i = 1; i <= 60; i++) {
    const num = String(10000 + i); // 010001..010060
    const region = regions[(i-1) % regions.length];
    const b = bbox[`${planet}|${region}`];
    const cls = CLASSES[Math.floor((i-1)/15)]; // 15 szt. na klasę
    const lat = +(b.latMin + rnd()*(b.latMax-b.latMin)).toFixed(1);
    const lon = +(b.lonMin + rnd()*(b.lonMax-b.lonMin)).toFixed(1);
    const m = META[cls];
    out.push({
      plot_id: `${P}-PLOT-${num}`, plot_number: num,
      handle: `${planet}-plot-${num}`, sku: `${P}-PLOT-${num}`,
      title: `${P.charAt(0)}${P.slice(1).toLowerCase()} Plot #${num} – Class ${cls}, ${region}`,
      vendor: 'Cosmic Lands', product_type: 'Land Plot',
      status: 'active', published: false,
      tags: `${planet}, class-${cls.toLowerCase()}, ${region.toLowerCase()}, available, new-480`,
      price: m.price, inventory_quantity: 1, inventory_policy: 'DENY',
      planet, region, region_id: b.rid, region_code: b.rid, region_name: region,
      cls, class: cls, lat, lon,
      mf_plot_id: `${P}-PLOT-${num}`, mf_planet: planet, mf_region: region,
      mf_region_id: b.rid, mf_region_name: region, mf_class: cls,
      mf_coordinates_lat: lat, mf_coordinates_lon: lon,
      mf_cosmo_tokens: m.cosmo, mf_area_ha: m.area, mf_price_eur: m.price,
      mf_status: 'available', mf_sale_status: 'available', mf_product_status: 'active',
      mf_unlock_year: UNLOCK[planet], unlock_year: UNLOCK[planet],
      image_src: '', variant_id: null,
    });
  }
}

fs.writeFileSync('build/new480-manifest.json', JSON.stringify(out, null, 1));
// CSV (jeden plik, wszystkie 480)
const cols = ['plot_id','plot_number','handle','sku','title','vendor','product_type','status',
  'tags','price','inventory_quantity','planet','region','region_id','region_name','class',
  'lat','lon','mf_cosmo_tokens','mf_area_ha','mf_price_eur','mf_sale_status'];
const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
const csv = [cols.join(',')].concat(out.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
fs.writeFileSync('build/new480-catalog.csv', csv);
console.log(`OK: ${out.length} działek (8 planet x 60) | manifest + CSV w build/`);
console.log('klasy:', JSON.stringify(out.reduce((a,r)=>(a[r.mf_class]=(a[r.mf_class]||0)+1,a),{})));
console.log('próbka:', JSON.stringify(out[0]).slice(0,220));
