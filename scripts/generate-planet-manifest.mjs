#!/usr/bin/env node
// generate-planet-manifest.mjs — pełny katalog dowolnej planety: 8000 komercyjnych (13 regionów R01-R13)
// Logika 1:1 z generate-venus-manifest.mjs (sprawdzona, Venus 8000 live). Regiony z planet_regions.js.
// Użycie: node scripts/generate-planet-manifest.mjs <Planeta> [--dry-run]   np: Jupiter
// Wynik: build/<planet>-8000-manifest.json
import fs from 'node:fs';
import { PLANET_REGIONS } from '/opt/data/workspace/cosmiclands-space-map-work/data/planet_regions.js';

const RAW = process.argv[2];
if(!RAW){console.error('Usage: node scripts/generate-planet-manifest.mjs <Planeta> [--dry-run]');process.exit(1);}
const DRY = process.argv.includes('--dry-run');
// nazwa planety (np 'Jupiter')
const pKey = Object.keys(PLANET_REGIONS).find(k=>k.toLowerCase()===RAW.toLowerCase());
if(!pKey){console.error('Brak planety',RAW);process.exit(1);}
const PLANET = pKey.toLowerCase();
const REGIONS = PLANET_REGIONS[pKey].regions.filter(r=>!r.reserve);
if(REGIONS.length!==13){console.error('FATAL regionów',REGIONS.length);process.exit(1);}

const IMG = {
  jupiter:{S:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_S.png?v=1788921317',M:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_M.png?v=1788921317',L:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_L.png?v=1788921317',XL:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_XL.png?v=1788921316'},
  saturn:{S:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnS.png?v=1788921039',M:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnM.png?v=1788921040',L:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnL.png?v=1788921040',XL:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnXL.png?v=1788921040'},
  mercury:{S:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_S.png?v=1788921238',M:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_M.png?v=1788921238',L:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_L.png?v=1788921238',XL:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_xl.png?v=1788921237'},
  uranus:{S:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_s.png?v=1788920762',M:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_M.png?v=1788920762',L:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_L.png?v=1788920762',XL:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_xl.png?v=1788920763'},
  neptune:{S:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_S1.png?v=1788921206',M:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_M.png?v=1788921206',L:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_L.png?v=1788921206',XL:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_XL.png?v=1788921206'},
  pluto:{S:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_S_9c28d5a2-837f-4f54-bcef-e44780bef65a.png?v=1788921070',M:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_M.png?v=1788921070',L:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_L.png?v=1788921071',XL:'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_XL.png?v=1788921070'},
};
const planetImg=IMG[PLANET]; if(!planetImg){console.error('Brak IMG dla',PLANET);process.exit(1);}
const SOLD=new Set([]); // nowe planety: brak sprzedanych w zakresie — pełne 1..8000
const CLS_CFG={S:{area:0.5,price:50,cosmo:80,step:1},M:{area:1.5,price:129,cosmo:240,step:2},L:{area:4.5,price:369,cosmo:720,step:3},XL:{area:13.5,price:999,cosmo:2160,step:4}};
const CLASS_DIST=[{cls:'S',frac:0.4},{cls:'M',frac:0.3},{cls:'L',frac:0.2},{cls:'XL',frac:0.1}];
function slugify(s){return s.toLowerCase().replace(/[—–]/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function regionSlots(reg){const slots=[];for(let lon=reg.lon_min+0.5;lon<reg.lon_max;lon+=1)for(let lat=reg.lat_max-0.5;lat>reg.lat_min;lat-=1)slots.push({lat:+lat.toFixed(4),lon:+lon.toFixed(4)});return slots;}
function shuffle(a,seed){let s=(seed>>>0)||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}
const PLOT_UP=PLANET.toUpperCase();
const displayName=pKey;
const plots=[];let plotCounter=1;
function nextNum(){while(SOLD.has(String(plotCounter).padStart(6,'0')))plotCounter++;return String(plotCounter++).padStart(6,'0');}
for(let ri=0;ri<REGIONS.length;ri++){
  const reg=REGIONS[ri];
  const total=615+(ri<5?1:0); // 615*8+616*5=8000
  const regionSlug=slugify(reg.name.split('/')[0]);
  const counts={};let assigned=0;
  CLASS_DIST.forEach(({cls,frac},i)=>{const n=i===3?total-assigned:Math.round(total*frac);counts[cls]=n;assigned+=n;});
  if(assigned!==total)throw new Error(`counts ${reg.name}: ${assigned}!=${total}`);
  const slots=shuffle(regionSlots(reg),ri);
  let ptr=0;
  for(const {cls} of CLASS_DIST){
    const need=counts[cls],step=CLS_CFG[cls].step;
    const slice=slots.slice(ptr,ptr+need*step+step);
    const chosen=slice.filter((_,i)=>i%step===0).slice(0,need);
    ptr+=need*step+step;
    if(chosen.length<need)throw new Error(`Za mało slotów ${reg.name}/${cls}`);
    for(const slot of chosen){
      const num=nextNum();const cfg=CLS_CFG[cls];
      plots.push({
        plot_id:`${PLOT_UP}-PLOT-${num}`,plot_number:num,handle:`${PLANET}-plot-${num}`,sku:`${PLOT_UP}-PLOT-${num}`,
        title:`${displayName} Plot #${num} – Class ${cls}, ${reg.name}`,vendor:'Cosmic Lands',product_type:'Land Plot',
        status:'active',published:true,tags:[PLANET,`${PLANET}-plot`,`class-${cls.toLowerCase()}`,'available',`region-${regionSlug}`].join(', '),
        price:cfg.price,inventory_quantity:1,inventory_policy:'deny',image_src:planetImg[cls],
        mf_plot_id:`${PLOT_UP}-PLOT-${num}`,mf_planet:PLANET,mf_region:reg.name,mf_region_id:reg.region_id,mf_region_name:reg.name,
        mf_class:cls,mf_area_ha:cfg.area,mf_price_eur:cfg.price,mf_coordinates_lat:slot.lat,mf_coordinates_lon:slot.lon,
        mf_cosmo_tokens:cfg.cosmo,mf_status:'available',mf_sale_status:'available',mf_product_status:'active',mf_unlock_year:null,
        planet:PLANET,region:reg.name,region_code:reg.region_id,class:cls,lat:slot.lat,lon:slot.lon,unlock_year:null,variant_id:null,
      });
    }
  }
}
const errs=[];
const chk=(c,m)=>{if(!c)errs.push(m);};
chk(plots.length===8000,`${PLANET} komercyjnych: ${plots.length} (oczek. 8000)`);
chk(new Set(plots.map(p=>p.plot_id)).size===8000,'duplikaty plot_id');
chk(new Set(plots.map(p=>p.handle)).size===8000,'duplikaty handle');
chk(new Set(plots.map(p=>`${p.lat},${p.lon}`)).size===8000,'duplikaty coords');
chk(plots.every(p=>p.status==='active'&&p.published===true),'nie wszystkie active/published');
if(errs.length){console.error('BŁĘDY:\n'+errs.map(e=>' - '+e).join('\n'));process.exit(1);}
const sumCosmo=plots.reduce((s,p)=>s+p.mf_cosmo_tokens,0);
console.log(`✅ ${PLANET} manifest: ${plots.length} komercyjnych | COSMO sum: ${sumCosmo} | regiony: ${REGIONS.length}`);
if(!DRY){fs.writeFileSync(`build/${PLANET}-8000-manifest.json`,JSON.stringify(plots));console.log(`📄 Zapisano build/${PLANET}-8000-manifest.json`);}
else console.log('DRY-RUN — nie zapisano');
