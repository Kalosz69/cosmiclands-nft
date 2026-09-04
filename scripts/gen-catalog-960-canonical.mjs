// gen-catalog-960-canonical.mjs — ADAPTACJA kanonicznego generatora (preview-backup-20260812)
// ORYGINAŁ NIEZMIENIONY: /opt/data/preview-backup-20260812/generator/generate-mars-manifest.js
// Jedyna zmiana wg dyrektywy K (02.09): 120 działek/planetę (15 regionów × 8; klasy 3S/2M/2L/1XL
// na region = 48/36/24/12), unlock_year wg kanonu tokenomiki v3 (wszystkie planety, Pluto=2126).
// Wyjście: build/catalog960-canonical-manifest.json (format: kanon + aliasy mf_* dla workera/KV).
import fs from 'node:fs';

const INDEX_PATH = '/opt/data/workspace/cosmiclands-space-map-work/index.html';
const OUTPUT_PATH = '/opt/data/workspace/cosmiclands-nft/build/catalog960-canonical-manifest.json';
const IMAGE_BASE = 'https://map.cosmiclands.space/';
const PLOTS_PER_PLANET = 120;
const SLOTS_PER_REGION = 8; // 15 regionów × 8 = 120

const PLANET_NAMES = ['Mars', 'Venus', 'Jupiter', 'Saturn', 'Mercury', 'Uranus', 'Neptune', 'Pluto'];

// Kanon tokenomiki v3 (K 31.08, 13-tokenomika-v3 §4b): okna 10..40 lat wg odległości od Słońca, Pluto 100 lat.
const UNLOCK_V3 = { mercury: 2036, venus: 2041, mars: 2046, jupiter: 2051, saturn: 2056, uranus: 2061, neptune: 2066, pluto: 2126 };

const CLASS_CONFIG = {
  S: { fraction: 0.40, area_ha: 0.5, price_eur: 50, cosmo_tokens: 100, step: 1 },
  M: { fraction: 0.30, area_ha: 1.5, price_eur: 129, cosmo_tokens: 300, step: 2 },
  L: { fraction: 0.20, area_ha: 4.5, price_eur: 369, cosmo_tokens: 900, step: 3 },
  XL: { fraction: 0.10, area_ha: 13.5, price_eur: 999, cosmo_tokens: 2700, step: 4 },
};
const CLASS_ORDER = ['S', 'M', 'L', 'XL'];

// ── EKSTRAKCJA Z INDEX.HTML (jedno źródło prawdy — jak w kanonie) ───────────
function extractPlanetRegions(indexPath = INDEX_PATH) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const match = html.match(/const PLANET_REGIONS\s*=\s*(\{[\s\S]*?\n\});/);
  if (!match) throw new Error(`PLANET_REGIONS not found in ${indexPath}`);
  const regionsByPlanet = Function(`return (${match[1]});`)();
  if (!regionsByPlanet || !Array.isArray(regionsByPlanet.Mars)) throw new Error('PLANET_REGIONS.Mars missing');
  return regionsByPlanet;
}
function extractPlanetClassImages(indexPath = INDEX_PATH) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const match = html.match(/const PLANET_META\s*=\s*\[([\s\S]*?)\n\];/);
  if (!match) throw new Error(`PLANET_META not found in ${indexPath}`);
  const images = {};
  const entryPattern = /\{id:"([^"]+)"[\s\S]*?pi:\{S:"([^"]+)",\s*M:"([^"]+)",\s*L:"([^"]+)",\s*XL:"([^"]+)"\}\}/g;
  let entry;
  while ((entry = entryPattern.exec(match[1])) !== null) {
    const [, planetId, s, m, l, xl] = entry;
    images[planetId] = { S: IMAGE_BASE + s.replace(/^\/+/, ''), M: IMAGE_BASE + m.replace(/^\/+/, ''), L: IMAGE_BASE + l.replace(/^\/+/, ''), XL: IMAGE_BASE + xl.replace(/^\/+/, '') };
  }
  const missing = PLANET_NAMES.map(n => slugify(n)).filter(p => !images[p]);
  if (missing.length) throw new Error(`PLANET_META images missing for: ${missing.join(', ')}`);
  return images;
}

// ── POMOCNICZE (1:1 z kanonu) ───────────────────────────────────────────────
function slugify(v) { return v.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function seededShuffle(values, seed) {
  let state = seed >>> 0 || 1;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const r = values.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function regionSeed(region, i) { return ((region.id.charCodeAt(1) || 1) * 31 + (region.id.charCodeAt(2) || 1) * 17 + i * 7 + 1) >>> 0; }
function regionUnifiedSlots(region) {
  const slots = []; const step = 1;
  for (let lon = region.lon_min + step / 2; lon < region.lon_max; lon += step)
    for (let lat = region.lat_max - step / 2; lat > region.lat_min; lat -= step)
      slots.push({ lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) });
  return slots;
}
function classCounts(total) {
  const counts = {}; let assigned = 0;
  CLASS_ORDER.forEach((cls, i) => {
    const n = i === CLASS_ORDER.length - 1 ? total - assigned : Math.round(total * CLASS_CONFIG[cls].fraction);
    counts[cls] = n; assigned += n;
  });
  if (assigned !== total) throw new Error(`Class counts mismatch: ${assigned} != ${total}`);
  return counts;
}
function productCopy(p) {
  const cfg = CLASS_CONFIG[p.class];
  return [
    `<p><strong>🪐 Planet:</strong> ${p.planet_name}</p>`,
    `<p><strong>📍 Region:</strong> ${p.region}</p>`,
    `<p><strong>🏷️ Class:</strong> ${p.class} (${cfg.area_ha} ha)</p>`,
    `<p><strong>🗺️ Coordinates:</strong> lat:${p.lat.toFixed(2)} lon:${p.lon.toFixed(2)}</p>`,
    `<p><strong>🪙 COSMO Tokens:</strong> ${p.cosmo_tokens} upon purchase</p>`,
    `<p><strong>📜 Includes:</strong> Physical collector certificate and an NFT representing the digital collector record for this plot.</p>`,
    `<p><strong>⚖️ Legal notice:</strong> This is an artistic, digital and collectible assignment in the Cosmic Lands project. It is not real estate, land ownership, a deed, or a real-property right.</p>`,
  ].join('');
}

function createPlot({ planetName, planetId, classImages, region, className, slot, number }) {
  const cfg = CLASS_CONFIG[className];
  const isGenesis = Boolean(region.reserve);
  const num = String(number).padStart(6, '0');
  const regionSlug = slugify(region.name);
  const status = isGenesis ? 'reserved' : 'available';
  const sale_status = isGenesis ? 'genesis_locked' : 'available';
  const unlock = UNLOCK_V3[planetId]; // v3: wszystkie planety mają okno; Pluto 2126
  const core = {
    plot_id: `${planetName.toUpperCase()}-PLOT-${num}`, plot_number: num,
    handle: `${planetId}-plot-${num}`, sku: `${planetId.toUpperCase()}-PLOT-${num}`,
    planet: planetId, planet_name: planetName,
    region_id: region.id, region: region.name, region_code: region.id,
    class: className, area_ha: cfg.area_ha, price_eur: cfg.price_eur, currency: 'EUR',
    cosmo_tokens: cfg.cosmo_tokens, lat: slot.lat, lon: slot.lon,
    status, sale_status, product_status: 'active',
    inventory_quantity: isGenesis ? 0 : 1, inventory_policy: 'deny',
    unlock_year: unlock, unlock_timestamp: null,
    image_src: classImages[planetId][className],
    image_alt: `${planetName} Plot ${num} — Class ${className}`,
    title: `${planetName} Plot #${num} – Class ${className}, ${region.name}`,
    seo_title: `Buy ${planetName} Land Plot #${num} | Cosmic Lands`,
    seo_description: `Collectible ${planetName} Plot #${num}, Class ${className}, ${cfg.area_ha} ha in ${region.name}. This digital collector record does not represent real estate or land ownership.`,
    tags: `${planetId}, class-${className.toLowerCase()}, ${regionSlug}, ${status}`,
    variant_id: null,
  };
  core.body_html = productCopy(core);
  // Aliasy mf_* — format KV/workera (identyczny jak w działającym manifeście 480 z 25.08)
  return {
    ...core,
    vendor: 'Cosmic Lands', product_type: 'Land Plot', published: false,
    price: cfg.price_eur,
    mf_plot_id: core.plot_id, mf_planet: planetId, mf_region: region.name,
    mf_region_id: region.id, mf_region_name: region.name, mf_class: className,
    mf_area_ha: cfg.area_ha, mf_price_eur: cfg.price_eur,
    mf_coordinates_lat: slot.lat, mf_coordinates_lon: slot.lon,
    mf_cosmo_tokens: cfg.cosmo_tokens,
    mf_status: status, mf_sale_status: sale_status, mf_product_status: 'active',
    mf_unlock_year: unlock,
  };
}

function generatePlanetManifest(planetName, regionsByPlanet, classImages) {
  const planetId = slugify(planetName);
  const regions = regionsByPlanet[planetName].map(r => ({ id: r.id, name: r.name, lat_min: Number(r.lat_min), lat_max: Number(r.lat_max), lon_min: Number(r.lon_min), lon_max: Number(r.lon_max), ...(r.reserve ? { reserve: true } : {}) }));
  const plots = []; let nextNumber = 1;
  regions.forEach((region, ri) => {
    const counts = classCounts(SLOTS_PER_REGION); // 8 → 3S/2M/2L/1XL
    const shuffled = seededShuffle(regionUnifiedSlots(region), regionSeed(region, ri));
    let pointer = 0;
    CLASS_ORDER.forEach(cls => {
      const step = CLASS_CONFIG[cls].step;
      const slice = shuffled.slice(pointer, pointer + counts[cls] * step + step);
      const selected = slice.filter((_, i) => i % step === 0).slice(0, counts[cls]);
      pointer += counts[cls] * step + step;
      if (selected.length !== counts[cls]) throw new Error(`Not enough slots in ${region.id} for ${cls}`);
      selected.forEach(slot => { plots.push(createPlot({ planetName, planetId, classImages, region, className: cls, slot, number: nextNumber })); nextNumber += 1; });
    });
  });
  validate(plots, regions, planetName);
  return plots;
}

function validate(plots, regions, planetName) {
  const errors = []; const check = (c, m) => { if (!c) errors.push(m); };
  const commercial = plots.filter(p => p.sale_status === 'available').length;
  const genesis = plots.filter(p => p.sale_status === 'genesis_locked').length;
  check(plots.length === PLOTS_PER_PLANET, `Total: ${plots.length} != ${PLOTS_PER_PLANET}`);
  check(commercial === 104, `Commercial: ${commercial} != 104`);
  check(genesis === 16, `Genesis: ${genesis} != 16`);
  for (const k of ['plot_id', 'handle', 'sku']) check(new Set(plots.map(p => p[k])).size === plots.length, `Duplicate ${k}`);
  check(new Set(plots.map(p => `${p.lat},${p.lon}`)).size === plots.length, 'Duplicate coordinates');
  for (const rid of ['R14W', 'R14E']) check(plots.filter(p => p.region_id === rid).length === 8, `${rid} != 8`);
  const regionIds = [...new Set(plots.map(p => p.region_id))];
  for (const rid of regionIds) {
    const per = plots.filter(p => p.region_id === rid);
    for (const cls of CLASS_ORDER) check(per.filter(p => p.class === cls).length === classCounts(SLOTS_PER_REGION)[cls], `${rid} class ${cls} count wrong`);
  }
  for (const p of plots) {
    const reg = regions.find(r => r.id === p.region_id);
    if (!reg) { errors.push(`${p.plot_id}: unknown region`); continue; }
    check(p.lat >= reg.lat_min && p.lat <= reg.lat_max && p.lon >= reg.lon_min && p.lon <= reg.lon_max, `${p.plot_id}: coords outside region`);
    check(p.unlock_year === UNLOCK_V3[p.planet], `${p.plot_id}: unlock_year != kanon v3`);
    check(typeof p.image_src === 'string' && p.image_src.startsWith(IMAGE_BASE), `${p.plot_id}: image_src wrong`);
    if (reg.reserve) {
      check(p.sale_status === 'genesis_locked' && p.inventory_quantity === 0 && p.status === 'reserved', `${p.plot_id}: genesis policy wrong`);
    } else {
      check(p.sale_status === 'available' && p.inventory_quantity === 1, `${p.plot_id}: commercial policy wrong`);
    }
  }
  if (errors.length) throw new Error(`Validation failed (${planetName}):\n` + errors.slice(0, 10).join('\n'));
}

// ── MAIN ────────────────────────────────────────────────────────────────────
const regionsByPlanet = extractPlanetRegions();
const classImages = extractPlanetClassImages();
const all = [];
for (const name of PLANET_NAMES) all.push(...generatePlanetManifest(name, regionsByPlanet, classImages));
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(all, null, 1) + '\n');
const dist = {};
for (const p of all) { dist[p.planet] ??= { total: 0, S: 0, M: 0, L: 0, XL: 0, genesis: 0 }; dist[p.planet].total++; dist[p.planet][p.class]++; if (p.sale_status === 'genesis_locked') dist[p.planet].genesis++; }
console.log('RAZEM:', all.length);
for (const [planet, d] of Object.entries(dist)) console.log(` ${planet.padEnd(8)} total=${d.total} S=${d.S} M=${d.M} L=${d.L} XL=${d.XL} genesis=${d.genesis} unlock=${UNLOCK_V3[planet]}`);
console.log('sample:', all[0].handle, '|', all[0].image_src);
console.log('pluto sample:', all.find(p => p.planet === 'pluto').handle, '| unlock', all.find(p => p.planet === 'pluto').unlock_year, '|', all.find(p => p.planet === 'pluto').sale_status);
