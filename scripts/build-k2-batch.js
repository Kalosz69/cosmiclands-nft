// build-k2-batch.js — K2: 8 planet × 13 regionów komercyjnych × 4 klasy (S/M/L/XL) = 416 rekordów
// SPEC zatwierdzona przez K 06.09 ("wykonaj"):
//   Mars: 52 rekordy wycinane 1:1 z mars-manifest.json (kanon K-line, obrazy cdn mars-plot-*.jpg)
//         — S: pierwszy numer > 000010 (R01: 1–10 już żywe, sold 000007 nietykalny);
//         — M/L/XL: pierwszy rekord klasy w regionie.
//   Pozostałe 7 planet: 52 rekordy z all-planets-manifest-v3.json (R01–R13; R14 genesis pominięte),
//         poprawki do kanonu K-line: image_src → mapping K z set-media-480.mjs (32 URL HTTP 200),
//         area_ha → K-line (0.5/1.5/4.5/13.5), tags → wzór K-line, COSMO → kanon v3 100/300/900/2700.
// ZERO API — tylko lokalne pliki. Output: build/k2-manifest.json + raport walidacji.
import fs from 'node:fs';

const MARS = JSON.parse(fs.readFileSync('/opt/data/scripts/mars-manifest.json', 'utf8'));
const V3  = JSON.parse(fs.readFileSync('/opt/data/workspace/cosmiclands-nft/all-planets-manifest-v3.json', 'utf8'));

// ── mapping obrazów (planeta-klasa → URL) wyciągnięty z set-media-480.mjs (lista K z 03.09) ──
const smSrc = fs.readFileSync('/opt/data/workspace/cosmiclands-nft/scripts/set-media-480.mjs', 'utf8');
const IMG = {};
for (const m of smSrc.matchAll(/'([a-z]+-(?:s|m|l|xl))':`\$\{C\}\/([^`]+)`/g)) IMG[m[1]] = `https://cdn.shopify.com/s/files/1/1042/7367/4581/files/${m[2]}`;
if (Object.keys(IMG).length !== 32) { console.error(`FATAL: mapping obrazów ${Object.keys(IMG).length}/32`); process.exit(1); }

// ── kanon (K 06.09): COSMO 100/300/900/2700 dla wszystkich; ceny/area z linii K ──
const CANON = {
  S:  { price: 50,  cosmo: 100,  area: 0.5  },
  M:  { price: 129, cosmo: 300,  area: 1.5  },
  L:  { price: 369, cosmo: 900,  area: 4.5  },
  XL: { price: 999, cosmo: 2700, area: 13.5 },
};
const CLASSES = ['S', 'M', 'L', 'XL'];
const PLANETS = ['mars', 'venus', 'jupiter', 'saturn', 'mercury', 'uranus', 'neptune', 'pluto'];
const EXCLUDE_HANDLES = new Set(Array.from({ length: 10 }, (_, i) => `mars-plot-${String(i + 1).padStart(6, '0')}`)); // żywe 1–10 (sold 000007)

// ── MARS: 52 z oryginalnego manifestu (zero nowych obliczeń) ──
const marsOut = [];
const byRegion = new Map();
MARS.forEach((p, i) => {
  if (p.mf_region_id === 'R14W' || p.mf_region_id === 'R14E') return;
  if (!byRegion.has(p.mf_region_id)) byRegion.set(p.mf_region_id, []);
  byRegion.get(p.mf_region_id).push({ ...p, _pos: i });
});
for (const [rid, recs] of [...byRegion.entries()].sort()) {
  for (const cls of CLASSES) {
    let pick = recs.find(p => p.mf_class === cls && !EXCLUDE_HANDLES.has(p.handle))
            ?? recs.find(p => p.mf_class === cls);
    if (!pick) { console.error(`FATAL: Mars ${rid}/${cls} brak`); process.exit(1); }
    const { _pos, ...rec } = pick;
    // Kanon K 06.09: COSMO 100/300/900/2700 dla WSZYSTKICH — manifest captaina ma v2 (80/240/720/2160); nadpisujemy (żywe 1–10 nietknięte, delta do decyzji K)
    rec.mf_cosmo_tokens = CANON[cls].cosmo;
    marsOut.push(rec);
  }
}

// ── 7 planet: 52 z v3 + normalizacja do kanonu K-line ──
function k2FromV3(r, planet) {
  const cls = r.mf_class;
  const img = IMG[`${planet}-${cls.toLowerCase()}`];
  if (!img) { console.error(`FATAL: brak obrazu ${planet}-${cls}`); process.exit(1); }
  const regionSlug = String(r.mf_region_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    plot_id: `${planet.toUpperCase()}-PLOT-${r.plot_number}`,
    plot_number: r.plot_number,
    handle: r.handle,
    sku: `${planet.toUpperCase()}-PLOT-${r.plot_number}`,
    title: r.title,
    vendor: 'Cosmic Lands',
    product_type: 'Land Plot',
    status: 'active',
    published: true,
    tags: `${planet}, ${planet}-plot, class-${cls.toLowerCase()}, available, region-${regionSlug}`,
    price: CANON[cls].price,
    inventory_quantity: 1,
    inventory_policy: 'deny',
    image_src: img,
    mf_plot_id: `${planet.toUpperCase()}-PLOT-${r.plot_number}`,
    mf_planet: planet,
    mf_region: r.mf_region_name,
    mf_region_id: r.mf_region_id,
    mf_region_name: r.mf_region_name,
    mf_class: cls,
    mf_area_ha: CANON[cls].area,
    mf_price_eur: CANON[cls].price,
    mf_coordinates_lat: r.mf_coordinates_lat,
    mf_coordinates_lon: r.mf_coordinates_lon,
    mf_cosmo_tokens: CANON[cls].cosmo,
    mf_status: 'available',
    mf_sale_status: 'available',
    mf_product_status: 'active',
    mf_unlock_year: null,
    planet,
    region: r.mf_region_name,
    region_code: r.mf_region_id,
    class: cls,
    lat: r.mf_coordinates_lat,
    lon: r.mf_coordinates_lon,
    unlock_year: null,
    variant_id: null,
  };
}
const othersOut = [];
for (const planet of PLANETS.filter(p => p !== 'mars')) {
  const recs = V3.filter(r => (r.mf_planet || r.planet) === planet
    && ['R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11','R12','R13'].includes(r.mf_region_id));
  if (recs.length !== 52) { console.error(`FATAL: ${planet} ma ${recs.length}/52 (R01–R13 × 4)`); process.exit(1); }
  // kolejność: region rosnąco, potem S/M/L/XL
  recs.sort((a, b) => a.mf_region_id.localeCompare(b.mf_region_id) || CLASSES.indexOf(a.mf_class) - CLASSES.indexOf(b.mf_class));
  for (const r of recs) othersOut.push(k2FromV3(r, planet));
}

const manifest = [...marsOut, ...othersOut];

// ── WALIDACJA (twarda, exit 1 na pierwszym naruszeniu) ──
const errs = [];
const seenH = new Set(), seenS = new Set(), seenP = new Set();
// granice regionów z oryginału (Mars; v3 współdzielone granice per region_id)
const bounds = new Map();
for (const p of MARS) if (!bounds.has(p.mf_region_id)) bounds.set(p.mf_region_id, { latMin: 999, latMax: -999, lonMin: 999, lonMax: -999, name: p.mf_region_name });
for (const p of MARS) { const b = bounds.get(p.mf_region_id); b.latMin = Math.min(b.latMin, p.mf_coordinates_lat); b.latMax = Math.max(b.latMax, p.mf_coordinates_lat); b.lonMin = Math.min(b.lonMin, p.mf_coordinates_lon); b.lonMax = Math.max(b.lonMax, p.mf_coordinates_lon); }
for (const p of manifest) {
  if (seenH.has(p.handle)) errs.push(`dup handle: ${p.handle}`);
  if (seenS.has(p.sku)) errs.push(`dup sku: ${p.sku}`);
  if (seenP.has(p.plot_id)) errs.push(`dup plot_id: ${p.plot_id}`);
  seenH.add(p.handle); seenS.add(p.sku); seenP.add(p.plot_id);
  if (EXCLUDE_HANDLES.has(p.handle)) errs.push(`kolizja z żywymi 1–10: ${p.handle}`);
  const b = bounds.get(p.mf_region_id);
  if (p.mf_coordinates_lat == null || p.mf_coordinates_lon == null) errs.push(`brak coords: ${p.handle}`);
  else if (p.mf_coordinates_lat < b.latMin - 0.01 || p.mf_coordinates_lat > b.latMax + 0.01 || p.mf_coordinates_lon < b.lonMin - 0.01 || p.mf_coordinates_lon > b.lonMax + 0.01)
    errs.push(`coords poza regionem: ${p.handle} ${p.mf_coordinates_lat}/${p.mf_coordinates_lon} vs ${JSON.stringify(b)}`);
  if (p.mf_cosmo_tokens !== CANON[p.mf_class].cosmo) errs.push(`cosmo != kanon: ${p.handle}`);
  if (p.price !== CANON[p.mf_class].price) errs.push(`cena != kanon: ${p.handle}`);
  if (p.mf_area_ha !== CANON[p.mf_class].area) errs.push(`area != kanon: ${p.handle}`);
  if (!IMG[`${p.mf_planet}-${p.mf_class.toLowerCase()}`] && p.mf_planet !== 'mars') errs.push(`obraz poza mappingiem: ${p.handle}`);
  if (p.published !== true || p.mf_sale_status !== 'available' || p.inventory_quantity !== 1) errs.push(`stan != available/inv1: ${p.handle}`);
  if (!p.image_src || !p.image_src.startsWith('https://cdn.shopify.com/')) errs.push(`obraz nie-CDN: ${p.handle}`);
}
if (errs.length) { console.error('WALIDACJA FAIL:'); for (const e of errs.slice(0, 20)) console.error(' -', e); process.exit(1); }

// ── raport ──
const perPlanet = {}, perRegion = {}, perClass = {};
for (const p of manifest) { perPlanet[p.mf_planet] = (perPlanet[p.mf_planet] || 0) + 1; perRegion[`${p.mf_planet}:${p.mf_region_id}`] = (perRegion[`${p.mf_planet}:${p.mf_region_id}`] || 0) + 1; perClass[p.mf_class] = (perClass[p.mf_class] || 0) + 1; }
console.log(`K2 manifest: ${manifest.length} rekordów`);
console.log('per planeta:', JSON.stringify(perPlanet));
console.log('per klasa:', JSON.stringify(perClass));
const badRegions = Object.entries(perRegion).filter(([, n]) => n !== 4);
console.log('regiony != 4 szt.:', badRegions.length ? JSON.stringify(badRegions) : '0 (wszystkie 104 region×planet po 4)');
const marsS = marsOut.filter(p => p.mf_class === 'S').map(p => `${p.mf_region_id}:${p.plot_number}`).join(' ');
console.log('Mars S (kontynuacja po 1–10):', marsS);
console.log('sample venus R01 S:', JSON.stringify(othersOut.find(p => p.mf_planet === 'venus' && p.mf_region_id === 'R01' && p.mf_class === 'S'), null, 0).slice(0, 400));
fs.writeFileSync('build/k2-manifest.json', JSON.stringify(manifest, null, 1));
console.log('ZAPISANO build/k2-manifest.json — WALIDACJA OK');
