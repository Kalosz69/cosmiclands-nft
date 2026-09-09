#!/usr/bin/env node
// generate-venus-manifest.mjs — pełny katalog Venus 8000 komercyjnych (13 regionów R01-R13)
// Analogia do Marsa (generate-mars-manifest-captain.js). Regiony z planet_regions.js.
// Numeracja omija sprzedane (000001, 001233) — zostają jako "dziury" (nie kolidują).
// Obrazki: kanon Venus (CDN, fix-images). Pakiety COSMO REDUCED (K 18.08): S80/M240/L720/XL2160.
// Komercyjne R01-R13 → 8000; GENESIS (R14W/E) NIE są tu generowane (rezerwat osobno, jak Mars).
import fs from 'node:fs';
import { PLANET_REGIONS } from '/opt/data/workspace/cosmiclands-space-map-work/data/planet_regions.js';

const PLANET = 'venus';
const REGIONS = PLANET_REGIONS.Venus.regions.filter(r => !r.reserve); // 13 komercyjnych
const IMG = {
  S:  'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Venus_S.png?v=1788920685',
  M:  'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Venus_M.png?v=1788920685',
  L:  'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Vesnus_L.png?v=1788920685',
  XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Venus_xl.png?v=1788920685',
};
// Sprzedane (NIE nadpisywać — zostają w Shopify jako dziury numeracji)
const SOLD = new Set(['000001', '001233']);
const CLS_CFG = { S:{area:0.5,price:50,cosmo:80,step:1}, M:{area:1.5,price:129,cosmo:240,step:2}, L:{area:4.5,price:369,cosmo:720,step:3}, XL:{area:13.5,price:999,cosmo:2160,step:4} };
const CLASS_DIST = [{cls:'S',frac:0.4},{cls:'M',frac:0.3},{cls:'L',frac:0.2},{cls:'XL',frac:0.1}];

function slugify(s){return s.toLowerCase().replace(/[—–]/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function regionSlots(reg){const slots=[];for(let lon=reg.lon_min+0.5;lon<reg.lon_max;lon+=1)for(let lat=reg.lat_max-0.5;lat>reg.lat_min;lat-=1)slots.push({lat:+lat.toFixed(4),lon:+lon.toFixed(4)});return slots;}
function shuffle(a,seed){let s=(seed>>>0)||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}

const plots=[];let globalIndex=1;
// globalIndex MUSI przebiec 1..8000 pomijając SOLD — użyj licznika docelowego
let plotCounter=1;
function nextNum(){ while(SOLD.has(String(plotCounter).padStart(6,'0'))) plotCounter++; return String(plotCounter++).padStart(6,'0'); }

for(let ri=0;ri<REGIONS.length;ri++){
  const reg=REGIONS[ri];
  // komercyjne 13 regionów dzielą 8000. Mars: total=615+(ri<5?1:0) dla 13 regionów daje ~8000.
  // Venus analogicznie — ale najpierw policzmy przez pulę 8000/13 wg klasy globalnie? Uprość: region dostaje
  // liczbę ~ proporcjonalną. Mars użył total=615/616 per region (615*8+616*5=8000). Sprawdźmy dokładnie.
  const total = 615 + (ri < 5 ? 1 : 0);
  const regionSlug = slugify(reg.name.split('/')[0]);
  const counts={};let assigned=0;
  CLASS_DIST.forEach(({cls,frac},i)=>{const n=i===3?total-assigned:Math.round(total*frac);counts[cls]=n;assigned+=n;});
  if(assigned!==total) throw new Error(`counts ${reg.name}: ${assigned}!=${total}`);
  const slots=shuffle(regionSlots(reg),ri);
  let ptr=0;
  for(const {cls} of CLASS_DIST){
    const need=counts[cls],step=CLS_CFG[cls].step;
    const slice=slots.slice(ptr,ptr+need*step+step);
    const chosen=slice.filter((_,i)=>i%step===0).slice(0,need);
    ptr+=need*step+step;
    if(chosen.length<need) throw new Error(`Za mało slotów ${reg.name}/${cls}`);
    for(const slot of chosen){
      const num=nextNum();
      const cfg=CLS_CFG[cls];
      plots.push({
        plot_id:`VENUS-PLOT-${num}`,plot_number:num,handle:`venus-plot-${num}`,sku:`VENUS-PLOT-${num}`,
        title:`Venus Plot #${num} – Class ${cls}, ${reg.name}`,vendor:'Cosmic Lands',product_type:'Land Plot',
        status:'active',published:true,tags:['venus','venus-plot',`class-${cls.toLowerCase()}`,'available',`region-${regionSlug}`].join(', '),
        price:cfg.price,inventory_quantity:1,inventory_policy:'deny',image_src:IMG[cls],
        mf_plot_id:`VENUS-PLOT-${num}`,mf_planet:'venus',mf_region:reg.name,mf_region_id:reg.region_id,mf_region_name:reg.name,
        mf_class:cls,mf_area_ha:cfg.area,mf_price_eur:cfg.price,mf_coordinates_lat:slot.lat,mf_coordinates_lon:slot.lon,
        mf_cosmo_tokens:cfg.cosmo,mf_status:'available',mf_sale_status:'available',mf_product_status:'active',mf_unlock_year:null,
        planet:'venus',region:reg.name,region_code:reg.region_id,class:cls,lat:slot.lat,lon:slot.lon,unlock_year:null,variant_id:null,
      });
    }
  }
}
// walidacja
const errs=[];
const chk=(c,m)=>{if(!c)errs.push(m);};
chk(plots.length===8000,`Venus komercyjnych: ${plots.length} (oczek. 8000)`);
chk(new Set(plots.map(p=>p.plot_id)).size===8000,'duplikaty plot_id');
chk(new Set(plots.map(p=>p.handle)).size===8000,'duplikaty handle');
chk(new Set(plots.map(p=>`${p.lat},${p.lon}`)).size===8000,'duplikaty coords');
chk(plots.every(p=>!SOLD.has(p.plot_number)),'numeracja koliduje ze sprzedanymi');
chk(plots.every(p=>p.status==='active'&&p.published===true),'nie wszystkie active/published');
if(errs.length){console.error('BŁĘDY:\n'+errs.map(e=>' - '+e).join('\n'));process.exit(1);}
const sumCosmo=plots.reduce((s,p)=>s+p.mf_cosmo_tokens,0);
console.log(`✅ Venus manifest: ${plots.length} komercyjnych | COSMO sum: ${sumCosmo} | regiony: ${REGIONS.length}`);
if(!process.argv.includes('--dry-run')){fs.writeFileSync('build/venus-8000-manifest.json',JSON.stringify(plots));console.log('📄 Zapisano build/venus-8000-manifest.json');}
else console.log('DRY-RUN — nie zapisano');
