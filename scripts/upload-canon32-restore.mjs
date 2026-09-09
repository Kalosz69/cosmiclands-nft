// upload-canon32-restore.mjs — KROK 1 (GO K 09.09 ~02:00): upload 22 plików z
// assets/canon32-restore/ do biblioteki Files (stagedUpload + fileCreate).
// Po uploadie: read-back → 32/32 kanonu w bibliotece. Idempotentny: pomija pliki już obecne.
// Raport: build/upload-restore-<ts>.json  Rollback: fileDelete nowych gidów (ID w raporcie).
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r0=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r0.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});
  if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}
  const j=await res.json(); if(j.errors) throw new Error('GraphQL: '+JSON.stringify(j.errors).slice(0,400)); return j;}};

// ---- read-back: co już jest (nazwa → gid) ----
let cursor=null; const have=new Map();
for(;;){
  const j=await gql(`query($c:String){ files(first:200, after:$c){ nodes{ ...on MediaImage{ id alt image{ url } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const f of j.data.files.nodes){ const n=f.image?.url?.split('/').pop()?.split('?')[0]; if(n) have.set(n, f.id); }
  if(!j.data.files.pageInfo.hasNextPage) break;
  cursor=j.data.files.pageInfo.endCursor;
}
console.log('plików w bibliotece (przed):', have.size);

// ---- kanon 32: oczekiwane nazwy ----
const CANON=['mars-plot-s.jpg','mars-plot-m.jpg','mars-plot-l.jpg','mars-plot-xl.jpg',
 'Pluto_S.png','pluto-m.png','pluto-l.png','pluto-xl.png',
 'mercury-s.png','mercury-m.png','mercury-l.png','mercury-xl.png',
 'jupiter-s.png','jupiter-m.png','jupiter-l.png','jupiter-xl.png',
 'saturn-s.png','saturn-m.png','saturn-l.png','saturn-xl.png',
 'neptune-s.png','neptune-m.png','neptune-l.png','neptune-xl.png',
 'uranus-s.png','uranus-m.png','uranus-l.png','uranus-xl.png',
 'venus-s.png','venus-m.png','venus-l.png','venus-xl.png'];
const dir='/opt/data/workspace/cosmiclands-nft/assets/canon32-restore';
const toUpload=CANON.filter(n=>!have.has(n) && fs.existsSync(`${dir}/${n}`));
console.log('do uploadu:', toUpload.length, '→', toUpload.join(', '));

const results=[];
for(const name of toUpload){
  const buf=fs.readFileSync(`${dir}/${name}`);
  // 1) stagedUpload
  const st=await gql(`mutation($i:StagedUploadInput!){ stagedUploadsCreate(input:[$i]){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ field message } } }`,
    {i:{filename:name, mimeType:'image/png', resource:'IMAGE', fileSize:String(buf.length), httpMethod:'POST'}});
  if(st.data.stagedUploadsCreate.userErrors?.length){ results.push({name, err:'staged: '+JSON.stringify(st.data.stagedUploadsCreate.userErrors)}); console.log('STAGED-ERR', name); continue; }
  const tgt=st.data.stagedUploadsCreate.stagedTargets[0];
  // 2) POST multipart do staged URL — NAJPIERW wszystkie parametry polityki GCS, plik NA KOŃCU
  const fd=new FormData();
  for(const p of tgt.parameters) fd.append(p.name, p.value);
  fd.append('file', new Blob([buf]), name);
  const up=await fetch(tgt.url, {method:'POST', body:fd});
  if(!up.ok){ const txt=await up.text().catch(()=>'' ); results.push({name, err:'upload HTTP '+up.status+' '+txt.slice(0,200)}); console.log('UPLOAD-ERR', name, up.status, txt.slice(0,120)); continue; }
  // 3) fileCreate (API 2026-07: files=[...], odpowiedź files + userErrors)
  const fc=await gql(`mutation($f:[FileCreateInput!]!){ fileCreate(files:$f){ files{ id ...on MediaImage{ image{ url } } } userErrors{ field message } } }`,
    {f:[{originalSource:tgt.resourceUrl, contentType:'IMAGE', alt:null}]});
  const fe=fc.data.fileCreate.userErrors?.[0];
  if(fe){ results.push({name, err:'fileCreate: '+fe.field+' '+fe.message}); console.log('FILE-ERR', name, fe.message); continue; }
  const gid=fc.data.fileCreate.files?.[0]?.id;
  console.log(`OK ${name} → ${gid}`);
  results.push({name, gid, url:fc.data.fileCreate.files?.[0]?.image?.url});
  await new Promise(s=>setTimeout(s,400));
}

// ---- read-back po uploadie ----
let after=0; cursor=null; const canonPresent=[];
for(;;){
  const j=await gql(`query($c:String){ files(first:200, after:$c){ nodes{ ...on MediaImage{ image{ url } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const f of j.data.files.nodes){ const n=f.image?.url?.split('/').pop()?.split('?')[0]; if(CANON.includes(n)){ canonPresent.push(n); after++; } }
  if(!j.data.files.pageInfo.hasNextPage) break;
  cursor=j.data.files.pageInfo.endCursor;
}
console.log(`\nKANON w bibliotece po uploadzie: ${canonPresent.length}/32`);
const still=CANON.filter(n=>!canonPresent.includes(n));
if(still.length) console.log('wciąż brak:', still.join(', '));

const ts=new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
fs.writeFileSync(`build/upload-restore-${ts}.json`, JSON.stringify({ts, uploaded:results, canonPresent:canonPresent.length, stillMissing:still}, null, 1));
console.log(`raport: build/upload-restore-${ts}.json`);
