import fs from 'node:fs';
// worker root — distribution of statuses
const r = await fetch('https://cosmiclands-sync.flufy69happy.workers.dev/');
const txt = await r.text();
console.log('worker HTTP', r.status, 'len', txt.length);
try {
  const d = JSON.parse(txt);
  const vals = Object.values(d);
  const cnt = {};
  for (const v of vals) cnt[String(v)] = (cnt[String(v)]||0)+1;
  console.log('worker statusy:', JSON.stringify(cnt), '| total:', vals.length);
} catch(e) { console.log('worker non-JSON:', txt.slice(0,200)); }

// podwójny odczyt KV manifestu (2x, świeży)
const ct = fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const cfTOKEN = ct.match(/cfat_[A-Za-z0-9_-]+/)[0];
for (let i=0;i<2;i++) {
  const kres = await fetch('https://api.cloudflare.com/client/v4/accounts/f0121aafb566d0cfd1cac0289a32eccf/storage/kv/namespaces/a465f1a1a19848dd9ef32974c88d3b6d/values/manifest', {headers:{Authorization:`Bearer ${cfTOKEN}`}});
  const j = await kres.json();
  if (!Array.isArray(j)) { console.log('read',i,'-> NOT ARRAY:', JSON.stringify(j).slice(0,150)); continue; }
  const hist={}; j.forEach(p=>{const s=p.mf_sale_status??'?';hist[s]=(hist[s]||0)+1;});
  console.log('KV read',i,':', j.length, 'rekordow, statusy:', JSON.stringify(hist));
}