// build-mars-8000.mjs — manifest 8000 komercyjnych Marsa + 4 przeniesione sold (008001-008004)
import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('/opt/data/scripts/mars-manifest.json','utf8'));
const kom=m.filter(r=>r.mf_region_id!=='R14W'&&r.mf_region_id!=='R14E');
console.log('komercyjne:',kom.length);
if(kom.length!==8000){console.error('FATAL: oczekiwano 8000');process.exit(1);}

// 4 przeniesione (sprzedane) — nowe numery 008001+ (poza zakresem 1..8000)
const SOLD_MAP={
  'MARS-PLOT-000007':{newNum:8001,region:'R01'},
  'MARS-PLOT-000010':{newNum:8002,region:'R01'},
  'MARS-PLOT-003081':{newNum:8003,region:'R06'},
  'MARS-PLOT-003696':{newNum:8004,region:'R07'},
};
const H=String.prototype.padStart;
let counter=8001;
const extra=[];
for(const [oldId,cfg] of Object.entries(SOLD_MAP)){
  const src=m.find(r=>r.plot_id===oldId);
  if(!src){console.error('FATAL: brak',oldId);process.exit(1);}
  const rec={...src,
    plot_id:`MARS-PLOT-${String(cfg.newNum).padStart(6,'0')}`,
    plot_number:String(cfg.newNum).padStart(6,'0'),
    handle:`mars-plot-${String(cfg.newNum).padStart(6,'0')}`,
    sku:`MARS-PLOT-${String(cfg.newNum).padStart(6,'0')}`,
    mf_plot_id:`MARS-PLOT-${String(cfg.newNum).padStart(6,'0')}`,
    mf_sale_status:'sold',
    title:`Mars Plot #${String(cfg.newNum).padStart(6,'0')} – Class ${src.mf_class}, ${src.mf_region_name}`,
  };
  extra.push(rec);
}
console.log('przeniesione sold na nowe numery:',extra.map(r=>r.handle).join(', '));

// zapisz manifest 8004 (8000 + 4)
fs.writeFileSync('build/mars-8000-manifest.json',JSON.stringify([...kom,...extra],null,1));
console.log('zapisano build/mars-8000-manifest.json |',kom.length+extra.length,'rekordów');