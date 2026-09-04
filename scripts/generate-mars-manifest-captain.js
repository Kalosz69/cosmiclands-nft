#!/usr/bin/env node
// generate-mars-manifest.js — wersja od Kapitana (2026-08-16, "z wszystkimi poprawkami")
// DO WERYFIKACJI względem live snapshota (products_export_1.csv 16.08)
const fs = require('fs');
const DRY_RUN = process.argv.includes('--dry-run');

const SHOP = 'rzkhvb-m1.myshopify.com';
const COLLECTION_ID = 'gid://shopify/Collection/674277294421';

// ── REGIONY ──────────────────────────────────────────────────────────────────
// Regiony: PLANET_REGIONS.Mars z map.cosmiclands.space (produkcja, 2026-08-16) — zweryfikowane 1:1
// Stara robocza tabela (Acidalia/Arcadia itd., Genesis na biegunach) ZASTĄPIONA wartościami produkcyjnymi.
const REGIONS = [
  { name:'Acidalia',              id:'R01',  reserve:false, lat_min:55,  lat_max:90,  lon_min:-90,  lon_max:0    },
  { name:'Borealis',              id:'R02',  reserve:false, lat_min:55,  lat_max:90,  lon_min:0,    lon_max:90   },
  { name:'Tempe',                 id:'R03',  reserve:false, lat_min:18,  lat_max:55,  lon_min:-135, lon_max:-45  },
  { name:'Arabia',                id:'R04',  reserve:false, lat_min:18,  lat_max:55,  lon_min:-45,  lon_max:45   },
  { name:'Utopia',                id:'R05',  reserve:false, lat_min:18,  lat_max:55,  lon_min:45,   lon_max:135  },
  { name:'Tharsis/Marineris',     id:'R06',  reserve:false, lat_min:-18, lat_max:18,  lon_min:-135, lon_max:-45  },
  { name:'Margaritifer/Sabaea',   id:'R07',  reserve:false, lat_min:-18, lat_max:18,  lon_min:-45,  lon_max:45   },
  { name:'Isidis/Tyrrhena',       id:'R08',  reserve:false, lat_min:-18, lat_max:18,  lon_min:45,   lon_max:135  },
  { name:'Daedalia/Solis',        id:'R09',  reserve:false, lat_min:-50, lat_max:-18, lon_min:-135, lon_max:-45  },
  { name:'Noachis',               id:'R10',  reserve:false, lat_min:-50, lat_max:-18, lon_min:-45,  lon_max:45   },
  { name:'Hellas/Cimmeria',       id:'R11',  reserve:false, lat_min:-50, lat_max:-18, lon_min:45,   lon_max:135  },
  { name:'Aonia/Argentea',        id:'R12',  reserve:false, lat_min:-90, lat_max:-50, lon_min:-90,  lon_max:0    },
  { name:'Promethei',             id:'R13',  reserve:false, lat_min:-90, lat_max:-50, lon_min:0,    lon_max:90   },
  { name:'Amazonis Genesis — West', id:'R14W', reserve:true, unlock_year:2036, lat_min:-50, lat_max:55, lon_min:-160, lon_max:-135 },
  { name:'Amazonis Genesis — East', id:'R14E', reserve:true, unlock_year:2036, lat_min:-50, lat_max:55, lon_min:135,  lon_max:160  },
];

// ── KLASY ────────────────────────────────────────────────────────────────────
const IMG_BASE = 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/';
// Pakiety COSMO: tokenomika v2 (K 18.08) — zmniejszone o 20%: S=80, M=240, L=720, XL=2160.
// Działki KOMERCYJNE (8000/planetę): pakiety REDUCED (80/240/720/2160) → 3 712 000 COSMO/planetę.
// Rezerwat GENESIS (2000/planetę): PEŁNE pakiety (100/300/900/2700) → 1 160 000 COSMO/planetę
//   (decyzja K 18.08: rezerwat 16 000 działek = 9 280 000 COSMO, patrz 12-KTO-USTALA-CENE §2/§4/§5).
// 1 planeta (10k działek) = 4 872 000 COSMO teoretycznie (z zaokrągleń klas: ~4 868 000).
// Pełny podział 58M: 12-KTO-USTALA-CENE-2026-08-18.md
const CLS_CFG = {
  S:  { area:0.5,  price:50,  cosmo:80,   img:'mars-plot-s.jpg',  ver:'1778230340', step:1 },
  M:  { area:1.5,  price:129, cosmo:240,  img:'mars-plot-m.jpg',  ver:'1778230340', step:2 },
  L:  { area:4.5,  price:369, cosmo:720,  img:'mars-plot-l.jpg',  ver:'1778230340', step:3 },
  XL: { area:13.5, price:999, cosmo:2160, img:'mars-plot-xl.jpg', ver:'1778230339', step:4 },
};
// Genesis/Rezerwat: PEŁNE pakiety (K 18.08) — 2000 działek/planetę = 1 160 000 COSMO
// (800×100 + 600×300 + 400×900 + 200×2700); 8 planet = 9 280 000.
const CLS_CFG_GENESIS = {
  S:  { ...CLS_CFG.S,  cosmo:100  },
  M:  { ...CLS_CFG.M,  cosmo:300  },
  L:  { ...CLS_CFG.L,  cosmo:900  },
  XL: { ...CLS_CFG.XL, cosmo:2700 },
};
const CLASS_DIST = [
  { cls:'S',  frac:0.40 },
  { cls:'M',  frac:0.30 },
  { cls:'L',  frac:0.20 },
  { cls:'XL', frac:0.10 },
];

// ── HELPERS ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function regionUnifiedSlots(reg) {
  const step = 1, slots = [];
  for (let lon = reg.lon_min + step/2; lon < reg.lon_max; lon += step)
    for (let lat = reg.lat_max - step/2; lat > reg.lat_min; lat -= step)
      slots.push({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)) });
  return slots;
}

function seededShuffle(arr, seed) {
  let s = (seed >>> 0) || 1;
  const rand = () => { s = (Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
  const r = arr.slice();
  for (let i = r.length-1; i > 0; i--) {
    const j = Math.floor(rand()*(i+1));
    [r[i],r[j]] = [r[j],r[i]];
  }
  return r;
}

// ── GENERATOR ────────────────────────────────────────────────────────────────
const plots = [];
let globalIndex = 1;

REGIONS.forEach((reg, ri) => {
  const total = reg.reserve ? 1000 : (615 + (ri < 5 ? 1 : 0));
  const regionSlug = slugify(reg.name.split('/')[0]); // live: region-acidalia, region-tharsis (pierwszy człon nazwy, NIE kody aci)

  const counts = {};
  let assigned = 0;
  CLASS_DIST.forEach(({ cls, frac }, i) => {
    const n = i === CLASS_DIST.length-1 ? total-assigned : Math.round(total*frac);
    counts[cls] = n;
    assigned += n;
  });
  if (assigned !== total) throw new Error(`counts mismatch: ${reg.name} (${assigned} != ${total})`);

  const slots = regionUnifiedSlots(reg);
  const shuffled = seededShuffle(slots, ri);

  let ptr = 0;
  CLASS_DIST.forEach(({ cls }) => {
    const need = counts[cls];
    const step = CLS_CFG[cls].step;
    const slice = shuffled.slice(ptr, ptr + need*step + step);
    const chosen = slice.filter((_,i) => i%step===0).slice(0, need);
    ptr += need*step + step;

    if (chosen.length < need)
      throw new Error(`Za mało slotów: ${reg.name} / ${cls}: potrzeba ${need}, dostępne ${chosen.length}`);

    chosen.forEach(slot => {
      const num = String(globalIndex).padStart(6,'0');
      const isGenesis = reg.reserve;
      // Genesis/Rezerwat niesie PEŁNY pakiet COSMO (100/300/900/2700, K 18.08);
      // komercyjne — pakiety REDUCED (80/240/720/2160).
      const cfg = isGenesis ? CLS_CFG_GENESIS[cls] : CLS_CFG[cls];

      // Tagi zgodne z live (CSV 16.08): mars, mars-plot, class-{x}, available/locked,
      // region-{slug} (komercyjne) lub nature_reserve+zone-anr (Genesis)
      const tags = [
        'mars',
        'mars-plot',
        `class-${cls.toLowerCase()}`,
        ...(isGenesis
          ? ['locked', 'nature_reserve', 'zone-anr']
          : ['available', `region-${regionSlug}`]),
      ];

      plots.push({
        plot_id:            `MARS-PLOT-${num}`,
        plot_number:        num,
        handle:             `mars-plot-${num}`,
        sku:                `MARS-PLOT-${num}`,

        title:              `Mars Plot #${num} – Class ${cls}, ${reg.name}`,
        vendor:             'Cosmic Lands',
        product_type:       'Land Plot',
        status:             'active',
        published:          true,
        tags:               tags.join(', '),

        price:              cfg.price,
        inventory_quantity: isGenesis ? 0 : 1,
        inventory_policy:   'deny',

        image_src: `${IMG_BASE}${cfg.img}?v=${cfg.ver}`,

        mf_plot_id:         `MARS-PLOT-${num}`,
        mf_planet:          'mars',
        mf_region:          reg.name,
        mf_region_id:       reg.id,
        mf_region_name:     reg.name,
        mf_class:           cls,
        mf_area_ha:         cfg.area,
        mf_price_eur:       cfg.price,
        mf_coordinates_lat: slot.lat,
        mf_coordinates_lon: slot.lon,
        mf_cosmo_tokens:    cfg.cosmo,
        mf_status:          isGenesis ? 'reserved' : 'available',
        mf_sale_status:     isGenesis ? 'genesis_locked' : 'available',
        mf_product_status:  'active',
        mf_unlock_year:     isGenesis ? 2036 : null,

        planet:             'mars',
        region:             reg.name,
        region_code:        reg.id,
        class:              cls,
        lat:                slot.lat,
        lon:                slot.lon,
        unlock_year:        isGenesis ? 2036 : null,
        variant_id:         null,
      });
      globalIndex++;
    });
  });

  console.log(`✓ ${reg.name}: ${total} (S:${counts.S} M:${counts.M} L:${counts.L} XL:${counts.XL})`);
});

// ── WALIDACJA ────────────────────────────────────────────────────────────────
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

check(plots.length === 10000, `Łącznie: ${plots.length} (oczekiwano 10000)`);
check(plots.filter(p => p.mf_status === 'available').length === 8000, 'Komercyjnych != 8000');
check(plots.filter(p => p.mf_status === 'reserved').length === 2000, 'Genesis != 2000');
check(plots.filter(p => p.region_code === 'R14W').length === 1000, 'R14W != 1000');
check(plots.filter(p => p.region_code === 'R14E').length === 1000, 'R14E != 1000');
check(new Set(plots.map(p => p.plot_id)).size   === 10000, 'Duplikaty plot_id');
check(new Set(plots.map(p => p.handle)).size    === 10000, 'Duplikaty handle');
check(new Set(plots.map(p => p.sku)).size       === 10000, 'Duplikaty SKU');
check(new Set(plots.map(p => `${p.lat},${p.lon}`)).size === 10000, 'Duplikaty coords');
plots.filter(p => p.mf_status === 'reserved').forEach(p => {
  check(p.inventory_quantity === 0,   `Genesis ${p.plot_id}: inventory != 0`);
  check(p.mf_sale_status === 'genesis_locked', `Genesis ${p.plot_id}: sale_status błędny`);
  check(p.mf_unlock_year === 2036,    `Genesis ${p.plot_id}: unlock_year != 2036`);
});
check(plots.every(p => p.status === 'active'),   'Nie wszystkie active');
check(plots.every(p => p.published === true),     'Nie wszystkie published');
check(plots.every(p => p.variant_id === null),    'variant_id nie jest null');

// Sumy COSMO (tokenomika v2, K 18.08): komercyjne REDUCED, genesis PEŁNE
const sumCosmo = sel => plots.filter(sel).reduce((s, p) => s + p.mf_cosmo_tokens, 0);
const comCosmo = sumCosmo(p => p.mf_status === 'available');
const genCosmo = sumCosmo(p => p.mf_status === 'reserved');
check(comCosmo >= 3708000 && comCosmo <= 3712000, `Komercyjne COSMO: ${comCosmo} (oczekiwano ~3 712 000)`);
check(genCosmo === 1160000, `Genesis COSMO: ${genCosmo} (oczekiwano 1 160 000 = pełne pakiety)`);

if (errors.length > 0) {
  console.error('\n❌ BŁĘDY:');
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
}

console.log(`\n✅ Walidacja OK — ${plots.length} działek`);
console.log(`   Komercyjnych: ${plots.filter(p=>p.mf_status==='available').length} | Genesis: ${plots.filter(p=>p.mf_status==='reserved').length}`);

if (DRY_RUN) {
  console.log('\n🔍 DRY-RUN — plik nie zapisany');
  console.log('Przykład #1:', JSON.stringify(plots[0], null, 2));
} else {
  fs.writeFileSync('mars-manifest.json', JSON.stringify(plots, null, 2));
  console.log('\n📄 Zapisano mars-manifest.json');
}
