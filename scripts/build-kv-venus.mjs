// build-kv-venus.mjs — przebudowa manifestu KV: Mars 8004 + nowe Venus 8000 + 6 planet (312) stare
// Venus: nowe 8000 z build/venus-8000-manifest.json ZASTĘPUJĄ stare 52 w KV.
// Pozostałe planety i Mars: zachowane z obecnego KV.
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN=t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC='f0121aafb566d0cfd1cac0289a32eccf', NS='a465f1a1a19848dd9ef32974c88d3b6d';
const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}/values/manifest`,{headers:{Authorization:'Bearer '+TOKEN}});
const live=await r.json();
console.log('live KV:',live.length);
// Mars + 6 planet (poza venus)
const keep=live.filter(p=>(p.mf_planet||p.planet)!=='venus');
console.log('zostaje (mars+6 planet):',keep.length);
const perPlanet={};keep.forEach(p=>{const pl=p.mf_planet||p.planet;perPlanet[pl]=perPlanet[pl]?perPlanet[pl]+1:1;});
console.log('per planeta (keep):',JSON.stringify(perPlanet));
// nowe Venus 8000
const venus=JSON.parse(fs.readFileSync('build/venus-8000-manifest.json','utf8'));
console.log('nowe venus:',venus.length);
const merged=[...keep,...venus];
console.log('merged total:',merged.length);
// walidacja unikalności handle
const handles=new Set();let dup=0;
for(const p of merged){if(handles.has(p.handle))dup++;handles.add(p.handle);}
console.log('duplikaty handle:',dup);
if(dup){console.error('FATAL duplikaty');process.exit(1);}
fs.writeFileSync('build/kv-manifest-venus.json',JSON.stringify(merged));
console.log('ZAPISANO build/kv-manifest-venus.json',merged.length);
