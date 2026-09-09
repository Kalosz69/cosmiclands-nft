// push-kv-venus.mjs — push manifestu 16316 (Mars 8004 + 6 planet 312 + Venus 8000) do KV
// Wzorzec push-kv-8368.mjs: backup → PUT → read-back + sanity.
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN=t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC='f0121aafb566d0cfd1cac0289a32eccf', NS='a465f1a1a19848dd9ef32974c88d3b6d';
const SRC='build/kv-manifest-venus.json';
const manifest=JSON.parse(fs.readFileSync(SRC,'utf8'));
if(!Array.isArray(manifest)||manifest.length!==16316)throw new Error(`manifest ma ${manifest.length}, oczekiwano 16316`);
const api=(path,opts={})=>fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`,{...opts,headers:{Authorization:'Bearer '+TOKEN,...(opts.headers||{})}});
// backup
const old=await api('/values/manifest');
if(!old.ok)throw new Error(`read fail ${old.status}`);
const oldText=await old.text();
const oldCount=JSON.parse(oldText).length;
const ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
fs.writeFileSync(`build/manifest-kv-backup-${ts}.json`,oldText);
console.log(`backup: manifest-kv-backup-${ts}.json (${oldCount})`);
// PUT
const put=await api('/values/manifest',{method:'PUT',body:JSON.stringify(manifest)});
if(put.status!==200)throw new Error(`PUT fail ${put.status} ${await put.text()}`);
console.log('PUT 16316 → 200');
// read-back
const rb=JSON.parse(await (await api('/values/manifest')).text());
console.log('read-back:',rb.length);
if(rb.length!==16316)throw new Error(`read-back ${rb.length} != 16316`);
const byPlanet={};const handles=new Set();let dup=0;
for(const p of rb){const pl=p.mf_planet||p.planet;byPlanet[pl]=byPlanet[pl]?byPlanet[pl]+1:1;if(handles.has(p.handle))dup++;handles.add(p.handle);}
console.log('per planeta:',JSON.stringify(byPlanet),'| dup:',dup);
if(dup)throw new Error('duplikaty');
console.log('PUSH KV 16316 OK — mapa pokaże Mars 8004 + 6×52 + Venus 8000');
