// Brakujace SKU po dotychczasowych biegach importu (do ewentualnego dogrania).
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('build/import480-report.json','utf8'));
console.log('raport: ok=' + r.ok.length + ' fail=' + r.failed.length);
const okSkus = new Set(r.ok);
const PLOT = JSON.parse(fs.readFileSync('build/new480-manifest.json','utf8'));
const missing = PLOT.filter(p => !okSkus.has(p.sku));
console.log('brakujacych:', missing.length);
console.log('pierwsze 5:', missing.slice(0,5).map(p=>p.sku).join(', '));
fs.writeFileSync('build/import480-missing.json', JSON.stringify(missing.map(p=>p.sku), null, 1));
