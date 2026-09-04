// gen-catalog-480-canonical.mjs — TEST 60/planetę ×8 = 480 (przed wieczornym docelowym wgraniem)
// KOREKTA K 04.09: preview-backup-20260812 = MATERIAŁ HISTORYCZNY Z BŁĘDAMI — nie jest wzorcem.
// Wzorzec FORMATU = wyłącznie DZIAŁAJĄCY, zweryfikowany live stan: 960 w sklepie
// (gen-catalog-960-canonical.mjs → import 960/960 OK → drift 0). Stąd: tagi, body_html, seo,
// obrazy i mechanika slotów (regionUnifiedSlots + seededShuffle) = 1:1 z 960.
// Różnice TYLKO te (dyrektywa K 04.09):
//   1) 60/planetę; genesis 12 = 6×R14W + 6×R14E, klasy 5S/4M/2L/1XL
//   2) komercyjne 48, round-robin R01–R13; klasy globalnie 24S/18M/12L/6XL (40/30/20/10)
//   3) available BEZ unlock_year (null); genesis z unlock wg tabeli v3 (live-zweryfikowane 960)
import fs from 'node:fs';

const INDEX_PATH = '/opt/data/workspace/preview/index.html'; // nginx serwuje ten plik = źródło mapy
const OUT = '/opt/data/workspace/cosmiclands-nft/build/catalog480-canonical-manifest.json';
const REF960 = '/opt/data/workspace/cosmiclands-nft/build/catalog960-canonical-manifest.json'; // live wzorzec
const IMAGE_BASE = 'https://map.cosmiclands.space/';
const PLANET_NAMES = ['Mars', 'Venus', 'Jupiter', 'Saturn', 'Mercury', 'Uranus', 'Neptune', 'Pluto'];
const UNLOCK = { mercury: 2036, venus: 2041, mars: 2046, jupiter: 2051, saturn: 2056, uranus: 2061, neptune: 2066, pluto: 2126 }; // z live 960

// ── EKSTRAKCJA PLANET_REGIONS z mapy (identyczny regex jak w 960) ────────────
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const m = html.match(/const PLANET_REGIONS\s*=\s*(\{[\s\S]*?\n\});/);
if (!m) throw new Error('PLANET_REGIONS not found in ' + INDEX_PATH);
const regionsByPlanet = Function(`return (${m[1]});`)();
if (!regionsByPlanet?.Mars) throw new Error('PLANET_REGIONS.Mars missing');

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
function productCopy(p) { // 1:1 z 960
  const cfg = { 0.5: '0.5 ha', 1.5: '1.5 ha', 4.5: '4.5 ha', 13.5: '13.5 ha' }[p.area_ha];
  return [
    `<p><strong>🪐 Planet:</strong> ${p.planet_name}</p>`,
    `<p><strong>📍 Region:</strong> ${p.region}</p>`,
    `<p><strong>🏷️ Class:</strong> ${p.class} (${cfg})</p>`,
    `<p><strong>🗺️ Coordinates:</strong> lat:${p.lat.toFixed(2)} lon:${p.lon.toFixed(2)}</p>`,
    `<p><strong>🪙 COSMO Tokens:</strong> ${p.cosmo_tokens} upon purchase</p>`,
    `<p><strong>📜 Includes:</strong> Physical collector certificate and an NFT representing the digital collector record for this plot.</p>`,
    `<p><strong>⚖️ Legal notice:</strong> This is an artistic, digital and collectible assignment in the Cosmic Lands project. It is not real estate, land ownership, a deed, or a real-property right.</p>`,
  ].join('');
}

const CFG = { S: { area: 0.5, price: 50, cosmo: 100 }, M: { area: 1.5, price: 129, cosmo: 300 }, L: { area: 4.5, price: 369, cosmo: 900 }, XL: { area: 13.5, price: 999, cosmo: 2700 } };

// Rozkład: rezerwat (pozycje 0–11) = 5S/4M/2L/1XL; komercyjne (12–59) = 19S/14M/10L/5XL przetasowane deterministycznie
const GEN_CLS = ['S', 'M', 'S', 'L', 'S', 'M', 'L', 'S', 'M', 'M', 'S', 'XL']; // 5S/4M/2L/1XL
const tail = [...Array(19).fill('S'), ...Array(14).fill('M'), ...Array(10).fill('L'), ...Array(5).fill('XL')];
{ let s = 42; for (let i = tail.length - 1; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const j = s % (i + 1); [tail[i], tail[j]] = [tail[j], tail[i]]; } }
const CLS_SEQ = [...GEN_CLS, ...tail];

function allocateRegions(planetRegions) {
  const P13 = planetRegions.filter(r => !r.reserve).map(r => r.id);
  const GEN = planetRegions.filter(r => r.reserve).map(r => r.id);
  if (P13.length !== 13 || GEN.length !== 2) throw new Error(`regiony: 13 komercyjnych + 2 rezerwaty, jest ${P13.length}+${GEN.length}`);
  const reg = [...Array(6).fill(GEN[0]), ...Array(6).fill(GEN[1])];
  for (let i = 0; i < 48; i++) reg.push(P13[i % P13.length]);
  return reg;
}

const all = [];
for (const planetName of PLANET_NAMES) {
  const planetId = slugify(planetName);
  const regions = regionsByPlanet[planetName].map(r => ({ id: r.id, name: r.name, lat_min: Number(r.lat_min), lat_max: Number(r.lat_max), lon_min: Number(r.lon_min), lon_max: Number(r.lon_max), ...(r.reserve ? { reserve: true } : {}) }));
  const byId = Object.fromEntries(regions.map(r => [r.id, r]));
  const REG_SEQ = allocateRegions(regions);
  const slots = {}; const ptr = {};
  for (const r of regions) { slots[r.id] = seededShuffle(regionUnifiedSlots(r), regionSeed(r, PLANET_NAMES.indexOf(planetName))); ptr[r.id] = 0; }
  for (let i = 0; i < 60; i++) {
    const num = String(i + 1).padStart(6, '0');
    const region = byId[REG_SEQ[i]];
    if (!region) throw new Error(`${planetId}: brak regionu ${REG_SEQ[i]}`);
    const cls = CLS_SEQ[i];
    const isGenesis = Boolean(region.reserve);
    const slot = slots[region.id][ptr[region.id]++];
    if (!slot) throw new Error(`${planetId}/${region.id}: brak slotów`);
    const cfg = CFG[cls];
    const status = isGenesis ? 'reserved' : 'available';
    const sale_status = isGenesis ? 'genesis_locked' : 'available';
    const unlock = isGenesis ? UNLOCK[planetId] : null; // JEDYNA zmiana semantyki vs 960 (K 04.09)
    const core = {
      plot_id: `${planetName.toUpperCase()}-PLOT-${num}`, plot_number: num,
      handle: `${planetId}-plot-${num}`, sku: `${planetName.toUpperCase()}-PLOT-${num}`,
      planet: planetId, planet_name: planetName,
      region_id: region.id, region: region.name, region_code: region.id,
      class: cls, area_ha: cfg.area, price_eur: cfg.price, currency: 'EUR',
      cosmo_tokens: cfg.cosmo, lat: slot.lat, lon: slot.lon,
      status, sale_status, product_status: 'active',
      inventory_quantity: isGenesis ? 0 : 1, inventory_policy: 'deny',
      unlock_year: unlock, unlock_timestamp: null,
      image_src: `${IMAGE_BASE}images/${planetId}/${planetName}_${cls}.png`,
      image_alt: `${planetName} Plot ${num} — Class ${cls}`,
      title: `${planetName} Plot #${num} – Class ${cls}, ${region.name}`,
      seo_title: `Buy ${planetName} Land Plot #${num} | Cosmic Lands`,
      seo_description: `Collectible ${planetName} Plot #${num}, Class ${cls}, ${cfg.area} ha in ${region.name}. This digital collector record does not represent real estate or land ownership.`,
      tags: `${planetId}, class-${cls.toLowerCase()}, ${slugify(region.name)}, ${status}`,
      variant_id: null,
    };
    core.body_html = productCopy(core);
    all.push({ ...core,
      vendor: 'Cosmic Lands', product_type: 'Land Plot', published: false, price: cfg.price,
      mf_plot_id: core.plot_id, mf_planet: planetId, mf_region: region.name,
      mf_region_id: region.id, mf_region_name: region.name, mf_class: cls,
      mf_area_ha: cfg.area, mf_price_eur: cfg.price,
      mf_coordinates_lat: slot.lat, mf_coordinates_lon: slot.lon,
      mf_cosmo_tokens: cfg.cosmo, mf_status: status, mf_sale_status: sale_status,
      mf_product_status: 'active', mf_unlock_year: unlock,
    });
  }
}

// ── TESTY ────────────────────────────────────────────────────────────────────
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
check(all.length === 480, `total ${all.length} != 480`);
const ref960 = JSON.parse(fs.readFileSync(REF960, 'utf8'));
const img960 = new Set(ref960.map(p => p.image_src)); // 32 URL-i z LIVE zweryfikowanego 960
for (const planetName of PLANET_NAMES) {
  const planetId = slugify(planetName);
  const ps = all.filter(p => p.planet === planetId);
  check(ps.length === 60, `${planetId}: ${ps.length} != 60`);
  const gen = ps.filter(p => p.sale_status === 'genesis_locked');
  check(gen.length === 12, `${planetId}: genesis ${gen.length} != 12`);
  const gc = {}; gen.forEach(p => gc[p.class] = (gc[p.class] || 0) + 1);
  check(JSON.stringify(gc) === JSON.stringify({ S: 5, M: 4, L: 2, XL: 1 }), `${planetId}: genesis klasy ${JSON.stringify(gc)}`);
  check(gen.every(p => (p.region_id === 'R14W' && gen.filter(g => g.region_id === 'R14W').length === 6) || (p.region_id === 'R14E' && gen.filter(g => g.region_id === 'R14E').length === 6)), `${planetId}: genesis 6+6 R14W/E`);
  check(gen.every(p => p.inventory_quantity === 0 && p.status === 'reserved' && p.inventory_policy === 'deny' && p.unlock_year === UNLOCK[planetId]), `${planetId}: genesis policy/unlock`);
  const av = ps.filter(p => p.sale_status === 'available');
  check(av.length === 48 && av.every(p => p.unlock_year === null && p.inventory_quantity === 1 && p.status === 'available'), `${planetId}: available policy / unlock_year != null`);
  const cc = {}; ps.forEach(p => cc[p.class] = (cc[p.class] || 0) + 1);
  check(JSON.stringify(cc) === JSON.stringify({ S: 24, M: 18, L: 12, XL: 6 }), `${planetId}: klasy ${JSON.stringify(cc)}`);
  check(new Set(ps.map(p => p.plot_id)).size === 60 && new Set(ps.map(p => p.handle)).size === 60 && new Set(ps.map(p => p.sku)).size === 60, `${planetId}: duplikaty id/handle/sku`);
  check(new Set(ps.map(p => `${p.lat},${p.lon}`)).size === 60, `${planetId}: duplikaty współrzędnych`);
  const regs = regionsByPlanet[planetName];
  for (const p of ps) {
    const r = regs.find(x => x.id === p.region_id);
    check(r && p.lat >= Number(r.lat_min) && p.lat <= Number(r.lat_max) && p.lon >= Number(r.lon_min) && p.lon <= Number(r.lon_max), `${p.plot_id}: poza regionem`);
    check(img960.has(p.image_src), `${p.plot_id}: image_src spoza zestawu live 960: ${p.image_src}`);
  }
  // tagi = format 960: planeta, class-x, region-slug, status
  for (const p of ps) { const r = regs.find(x => x.id === p.region_id); check(p.tags.split(', ').includes(slugify(r.name)), `${p.plot_id}: tag regionu != slug nazwy`); }
}
const img = new Set(all.map(p => p.image_src));
check(img.size === 32, `unikalne image_src ${img.size} != 32`);

fs.writeFileSync(OUT, JSON.stringify(all, null, 1) + '\n');
console.log(`OK: 480 → ${OUT} | image_src: ${img.size}/32 (identyczne z live 960)`);
for (const planetName of PLANET_NAMES) {
  const ps = all.filter(p => p.planet === slugify(planetName));
  const g = ps.filter(p => p.sale_status === 'genesis_locked').length;
  console.log(` ${planetName.padEnd(8)} 60 | S${ps.filter(p => p.class === 'S').length} M${ps.filter(p => p.class === 'M').length} L${ps.filter(p => p.class === 'L').length} XL${ps.filter(p => p.class === 'XL').length} | genesis ${g} | unlock ${UNLOCK[slugify(planetName)]}`);
}
const s = all.find(p => p.planet === 'mars' && p.sale_status === 'genesis_locked');
console.log('mars genesis sample:', s.plot_id, s.region_id, `lat${s.lat}/lon${s.lon}`, 'unlock', s.unlock_year);
const a = all.find(p => p.planet === 'mars' && p.sale_status === 'available');
console.log('mars available sample:', a.plot_id, a.region_id, `lat${a.lat}/lon${a.lon}`, 'unlock', a.unlock_year, '| tags:', a.tags);
