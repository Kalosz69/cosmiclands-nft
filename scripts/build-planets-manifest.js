#!/usr/bin/env node
/**
 * build-planets-manifest.js — zbuduj manifest 480 działek (8 planet) z Shopify
 *
 * Źródło prawdy: Shopify (produkty). Mars: zachowaj istniejące 60 wpisów z KV.
 * Pozostałe 7 planet: 60 produktów każda, dane z body_html (lat/lon) + tytułu (region/klasa).
 *
 * Schemat wpisu: 1:1 z mars-manifest.json (KV).
 * Usage: node build-planets-manifest.js > manifest-8-planets.json
 */
const fs = require('fs');

const DOMAIN = 'rzkhvb-m1.myshopify.com';
const raw = fs.readFileSync('/opt/data/.secrets/shop.txt', 'utf8');
const CLIENT_ID = (raw.match(/Id klienta\s+([a-f0-9]{32})/i) || [])[1];
const CLIENT_SECRET = (raw.match(/Klucz tajny\s+(shpss_[A-Za-z0-9]+)/i) || [])[1];

const PLANET_REGIONS = JSON.parse(fs.readFileSync('/tmp/planet-regions.json', 'utf8'));
const CLS = {
  S:  { area: 0.5,  cosmo: 100,  img: '-plot-s.jpg' },
  M:  { area: 1.5,  cosmo: 300,  img: '-plot-m.jpg' },
  L:  { area: 4.5,  cosmo: 900,  img: '-plot-l.jpg' },
  XL: { area: 13.5, cosmo: 2700, img: '-plot-xl.jpg' },
};
const IMG_BASE = 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/';
const VENDOR = 'Cosmic Lands';
const GENESIS_UNLOCK = 2036;
const PLANET_NAME = {
  mars: 'Mars', venus: 'Venus', jupiter: 'Jupiter', saturn: 'Saturn',
  mercury: 'Mercury', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
};

async function getToken() {
  const r = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  const j = await r.json();
  return j.access_token;
}

async function getAllProducts(tok) {
  const products = [];
  let url = `https://${DOMAIN}/admin/api/2026-07/products.json?limit=250`;
  while (url) {
    const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': tok } });
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    products.push(...(j.products || []));
    const link = r.headers.get('link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return products;
}

function parseTitle(title) {
  // "Jupiter Plot #000247 – Class M, Europa" → { cls, region }
  const cm = title.match(/Class (\w+)/);
  const rm = title.match(/Class \w+, (.+)$/);
  return { cls: cm ? cm[1] : null, region: rm ? rm[1].trim() : null };
}

function parseCoords(bodyHtml) {
  const m = (bodyHtml || '').match(/lat:(-?[\d.]+) lon:(-?[\d.]+)/);
  return m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : null;
}

function regionIdFor(planetName, regionName) {
  const regs = PLANET_REGIONS[planetName] || [];
  // dokładne dopasowanie nazwy (uważaj na myślnik em-dash)
  const hit = regs.find(r => r.name === regionName);
  return hit ? hit.id : null;
}

function makeEntry(p, planet, planetName, variant) {
  const num = (p.handle || '').split('-').pop();
  const { cls, region } = parseTitle(p.title);
  const coords = parseCoords(p.body_html || '');
  const rid = regionIdFor(planetName, region);
  const isGenesis = rid === 'R14W' || rid === 'R14E';
  const clsCfg = CLS[cls] || CLS.S;
  const sku = (variant && variant.sku) || `${planet.toUpperCase()}-PLOT-${num}`;
  const plotId = sku;
  const price = variant ? parseFloat(variant.price) : clsCfg && clsCfg.area ? 50 : 50;
  const imgName = planet + clsCfg.img;
  const tags = `available, class-${String(cls).toLowerCase()}, ${String(region).toLowerCase()}, ${planet}`;

  return {
    plot_id: plotId,
    plot_number: num,
    handle: p.handle,
    sku,
    title: p.title,
    vendor: VENDOR,
    product_type: 'Land Plot',
    status: 'active',
    published: true,
    tags,
    price,
    inventory_quantity: isGenesis ? 0 : 1,
    inventory_policy: 'deny',
    image_src: IMG_BASE + imgName + '?v=1778230340',
    mf_plot_id: plotId,
    mf_planet: planet,
    mf_region: region,
    mf_region_id: rid,
    mf_region_name: region,
    mf_class: cls,
    mf_area_ha: clsCfg.area,
    mf_price_eur: price,
    mf_coordinates_lat: coords ? coords.lat : null,
    mf_coordinates_lon: coords ? coords.lon : null,
    mf_cosmo_tokens: clsCfg.cosmo,
    mf_status: isGenesis ? 'reserved' : 'available',
    mf_sale_status: isGenesis ? 'genesis_locked' : 'available',
    mf_product_status: 'active',
    mf_unlock_year: isGenesis ? GENESIS_UNLOCK : null,
    planet,
    region,
    region_code: rid,
    class: cls,
    lat: coords ? coords.lat : null,
    lon: coords ? coords.lon : null,
    unlock_year: isGenesis ? GENESIS_UNLOCK : null,
    variant_id: variant ? String(variant.id) : null,
  };
}

(async () => {
  const tok = await getToken();
  const products = await getAllProducts(tok);

  // Mars: zachowaj istniejące 60 z KV
  const kvMars = JSON.parse(fs.readFileSync('/tmp/kv-manifest.json', 'utf8'));
  const marsHandles = new Set(kvMars.map(p => p.handle));

  const manifest = [...kvMars]; // 60 Mars (bez zmian)
  const skipped = [];

  for (const p of products) {
    const planet = (p.handle || '').split('-')[0];
    if (!PLANET_NAME[planet]) { skipped.push(`${p.handle} (nie-znana planeta)`); continue; }
    if (p.handle.startsWith('mars-') && marsHandles.has(p.handle)) continue; // już w KV
    if (p.handle.startsWith('mars-')) { skipped.push(`${p.handle} (nie-plot Marsa: ${p.title})`); continue; }
    if (p.status !== 'active') { skipped.push(`${p.handle} (status: ${p.status})`); continue; }
    const variant = (p.variants || [])[0] || {};
    const entry = makeEntry(p, planet, PLANET_NAME[planet], variant);
    manifest.push(entry);
  }

  // Walidacja
  const byPlanet = {};
  for (const e of manifest) byPlanet[e.mf_planet] = (byPlanet[e.mf_planet] || 0) + 1;
  const bad = manifest.filter(e => !e.lat || !e.lon || !e.mf_region_id || !e.mf_class);
  const genesis = manifest.filter(e => e.mf_sale_status === 'genesis_locked').length;
  const classes = {};
  for (const e of manifest) classes[e.mf_class] = (classes[e.mf_class] || 0) + 1;

  console.error('=== WALIDACJA ===');
  console.error('Razem:', manifest.length);
  console.error('Wg planety:', JSON.stringify(byPlanet));
  console.error('Klasy:', JSON.stringify(classes));
  console.error('Genesis locked:', genesis);
  console.error('Brak lat/lon/region/class:', bad.length, bad.slice(0, 5).map(b => b.handle).join(', '));
  console.error('Pominięte (skipped):', skipped.length);
  for (const s of skipped) console.error('  -', s);

  if (bad.length > 0) { console.error('BLAD: sa wpisy bez wspolrzednych — STOP'); process.exit(1); }

  process.stdout.write(JSON.stringify(manifest, null, 1));
})();
