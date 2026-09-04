// GEN-960 — GENERATOR KANONICZNY (K 02.09: "dla kazdej planety 120 dzialek rozlozonych rownomiernie
// pod postacia klas i ilosci na regiony"). Jedno zrodlo prawdy: PLANET_REGIONS z index.html mapy.
// Tokenomika v3: PEŁNE pakiety dla WSZYSTKICH (S100/M300/L900/XL2700); unlock_year kanon 13-v3.
// Wyjście: build/catalog960-manifest.json (format KV + pola shopify) + build/catalog960-catalog.csv
import fs from 'node:fs';
import vm from 'node:vm';

// ── ŹRÓDŁO REGIONÓW: index.html mapy (runtime extract — bez kopii) ──────────
const html = fs.readFileSync('/opt/data/workspace/cosmiclands-space-map-work/index.html','utf8');
const m = html.match(/const PLANET_REGIONS = (\{[\s\S]*?\n\});/);
if (!m) throw new Error('PLANET_REGIONS nie znalezione w index.html');
const PLANET_REGIONS = vm.runInNewContext(`(${m[1]})`);
const PLANETS = Object.keys(PLANET_REGIONS); // oczekiwane: 8
if (PLANETS.length !== 8) throw new Error(`Oczekiwano 8 planet, jest ${PLANETS.length}: ${PLANETS}`);

// ── KANON v3 (13-tokenomika-v3, K 31.08 + K) ────────────────────────────────
const UNLOCK = { mercury:2036, venus:2041, mars:2046, jupiter:2051, saturn:2056, uranus:2061, neptune:2066, pluto:2126 };
const CLS = {
  S:  { area:'0.5',  price:'50.00',  cosmo:100  },
  M:  { area:'1.5',  price:'129.00', cosmo:300  },
  L:  { area:'4.5',  price:'369.00', cosmo:900  },
  XL: { area:'13.5', price:'999.00', cosmo:2700 },
};
const PER_PLANET = 120; // 15 regionów × 8

// ── deterministyczny LCG (seed per planeta) ─────────────────────────────────
function rng(seed){ let s = seed>>>0 || 1; return () => { s = (Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
function planetSeed(name){ let h=0; for (const c of name) h = (h*31 + c.charCodeAt(0))>>>0; return (h ^ 0x5f4801)>>>0; }

function mkPlot({planetName, reg, cls, lat, lon, num, unlock}) {
  const P = planetName.toUpperCase();
  const planet = planetName.toLowerCase();
  const num6 = String(num).padStart(6,'0');
  const regionSlug = reg.name.split('/')[0].toLowerCase().replace(/[—–]/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const c = CLS[cls];
  const tags = [planet, `class-${cls.toLowerCase()}`, regionSlug, 'available', 'new-960'];
  if (reg.reserve) tags.push('reserve');
  return {
    handle: `${planet}-plot-${num6}`, plot_number: num6, plot_id: `${P}-PLOT-${num6}`, sku: `${P}-PLOT-${num6}`,
    title: `${planetName} Plot #${num6} – Class ${cls}, ${reg.name}`,
    vendor: 'Cosmic Lands', product_type: 'Land Plot',
    status: 'active', published: false,
    tags: tags.join(', '),
    price: Number(c.price), inventory_quantity: 1, inventory_policy: 'deny',
    image_src: '',
    planet, region: reg.name, region_code: reg.id, region_id: reg.id, region_name: reg.name,
    reserve: !!reg.reserve, cls, class: cls, lat, lon, unlock_year: unlock,
    mf_plot_id: `${P}-PLOT-${num6}`, mf_planet: planet, mf_region: reg.name,
    mf_region_id: reg.id, mf_region_name: reg.name, mf_class: cls,
    mf_coordinates_lat: lat, mf_coordinates_lon: lon,
    mf_cosmo_tokens: c.cosmo, mf_area_ha: Number(c.area), mf_price_eur: Number(c.price),
    mf_status: 'available', mf_sale_status: 'available', mf_product_status: 'active',
    mf_unlock_year: unlock, variant_id: null,
  };
}

const out = [];
for (const pName of PLANETS) {
  const regions = PLANET_REGIONS[pName];
  if (regions.length !== 15) throw new Error(`${pName}: oczekiwano 15 regionów, jest ${regions.length}`);
  const planet = pName.toLowerCase();
  if (!UNLOCK[planet]) throw new Error(`${planet}: brak unlock_year w kanonie!`);
  // talia klas: 48 S, 36 M, 24 L, 12 XL → deterministyczny shuffle per planeta
  const deck = [];
  for (const [cls,n] of Object.entries({S:48,M:36,L:24,XL:12})) for (let i=0;i<n;i++) deck.push(cls);
  const rand = rng(planetSeed(pName));
  for (let i=deck.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  // round-robin po regionach: działka i → region (i-1)%15; komórka w regionie = floor((i-1)/15)
  for (let i=1;i<=PER_PLANET;i++) {
    const reg = regions[(i-1)%15];
    const cls = deck[i-1];
    const cell = Math.floor((i-1)/15); // 0..7
    const cellLat = (reg.lat_max-reg.lat_min)/4, cellLon = (reg.lon_max-reg.lon_min)/2;
    const latBand = cell % 4, lonBand = Math.floor(cell/4);
    const lat = +((reg.lat_max - (latBand+0.5)*cellLat).toFixed(1));
    const lon = +((reg.lon_min + (lonBand+0.5)*cellLon).toFixed(1));
    out.push(mkPlot({planetName:pName, reg, cls, lat, lon, num:i, unlock:UNLOCK[planet]}));
  }
}

fs.mkdirSync('build',{recursive:true});
fs.writeFileSync('build/catalog960-manifest.json', JSON.stringify(out, null, 1));
// CSV (jeden plik, 960)
const cols = ['plot_id','plot_number','handle','sku','title','vendor','product_type','status',
  'tags','price','inventory_quantity','planet','region','region_id','region_name','class','reserve',
  'lat','lon','mf_cosmo_tokens','mf_area_ha','mf_price_eur','mf_sale_status','mf_unlock_year'];
const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
const csv = [cols.join(',')].concat(out.map(r => cols.map(c=>esc(r[c])).join(','))).join('\n');
fs.writeFileSync('build/catalog960-catalog.csv', csv);

// ── RAPORT STRUKTURY (weryfikacja równomierności) ───────────────────────────
const sum = {};
for (const r of out) {
  sum[r.planet] ??= {total:0, cls:{}, regions:{}};
  sum[r.planet].total++;
  sum[r.planet].cls[r.cls] = (sum[r.planet].cls[r.cls]||0)+1;
  sum[r.planet].regions[r.region_id] = (sum[r.planet].regions[r.region_id]||0)+1;
}
for (const [p,d] of Object.entries(sum)) console.log(p, 'total='+d.total, 'cls='+JSON.stringify(d.cls), 'regiony='+Object.keys(d.regions).length, 'per-region='+[...new Set(Object.values(d.regions))].join(','));
console.log('RAZEM:', out.length);
console.log('próbka:', JSON.stringify(out[0]).slice(0,240));
console.log('pluto próbka:', JSON.stringify(out.find(r=>r.planet==='pluto'&&r.handle.endsWith('000001'))).slice(0,240));