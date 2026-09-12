#!/usr/bin/env node
// build-push-kv-all.mjs — po importach wszystkich planet: zbuduj pełny manifest KV (8 planet × 8000) i push.
// Użycie: node scripts/build-push-kv-all.mjs [--no-push]  (--no-push = tylko build manifestu lokalnie)
// Wymaga: build/<planet>-8000-manifest.json dla WSZYSTKICH planet (mars, venus, jupiter, saturn, mercury, uranus, neptune, pluto).
// Wynik: build/kv-manifest-all.json + (jeśli nie --no-push) push do KV.
import fs from 'node:fs';
const NOPUSH=process.argv.includes('--no-push');
const PLANETS=['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'];
const merged=[];
for(const pl of PLANETS){
  const f=`build/${pl}-8000-manifest.json`;
  if(!fs.existsSync(f)){console.error('Brak',f,'— najpierw generate-planet-manifest dla',pl);process.exit(1);}
  const m=JSON.parse(fs.readFileSync(f,'utf8'));
  if(m.length<8000){console.error(`${pl}: ${m.length} < 8000`);process.exit(1);}
  merged.push(...m);
  console.log(`${pl}: ${m.length}`);
}
console.log('TOTAL:',merged.length);
// walidacja unikalności
const handles=new Set();let dup=0;
for(const p of merged){if(handles.has(p.handle))dup++;handles.add(p.handle);}
console.log('duplikaty handle:',dup);
if(dup){console.error('FATAL duplikaty');process.exit(1);}
fs.writeFileSync('build/kv-manifest-all.json',JSON.stringify(merged));
console.log('Zapisano build/kv-manifest-all.json',merged.length);
if(NOPUSH){console.log('--no-push: nie pushuję');process.exit(0);}
// push
const t=fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN=t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC='f0121aafb566d0cfd1cac0289a32eccf',NS='a465f1a1a19848dd9ef32974c88d3b6d';
const api=(path,opts={})=>fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`,{...opts,headers:{Authorization:'Bearer '+TOKEN,...(opts.headers||{})}});
const old=await api('/values/manifest');
const oldText=await old.text();
const oldCount=JSON.parse(oldText).length;
const ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
fs.writeFileSync(`build/manifest-kv-backup-${ts}.json`,oldText);
console.log(`backup: manifest-kv-backup-${ts}.json (${oldCount})`);
const put=await api('/values/manifest',{method:'PUT',body:JSON.stringify(merged)});
if(put.status!==200)throw new Error(`PUT fail ${put.status} ${await put.text()}`);
console.log('PUT',merged.length,'→ 200');
const rb=JSON.parse(await (await api('/values/manifest')).text());
console.log('read-back:',rb.length);
const by={};for(const p of rb){const pl=p.mf_planet||p.planet;by[pl]=by[pl]?by[pl]+1:1;}
console.log('per planeta:',JSON.stringify(by));
console.log('PUSH KV ALL OK');
