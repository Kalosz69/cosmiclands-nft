// restore-media-attach.mjs — KROK 2 (GO K 09.09): podpięcie kanonu 32 do wszystkich
// produktów bez media (393 szt. na wejściu). 33 Pluto podpięte ręcznie przez K — nietknięte.
//
// Faza A: dla każdej klasy, której pliku nie ma w bibliotece (22 szt.), attach jednego
//          produktu przez FileSetInput.originalSource (CDN URL z set-media-480.mjs).
// Faza B: attach pozostałych produktów po gid (id istniejącego pliku), batch 30, pacing 300ms.
// Read-back: pełny rescan — cel 426/426 z media. Raport + manifest rollback (productDeleteMedia).
import fs from 'node:fs';

const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};

// mapping KANON 32 (1:1 z set-media-480.mjs): klasa `${planeta}-${klasa}` → CDN URL z ?v=
const C='https://cdn.shopify.com/s/files/1/1042/7367/4581/files';
const IMG={
 'mars-s':`${C}/mars-plot-s.jpg?v=1778230340`,'mars-m':`${C}/mars-plot-m.jpg?v=1778230340`,
 'mars-l':`${C}/mars-plot-l.jpg?v=1778230340`,'mars-xl':`${C}/mars-plot-xl.jpg?v=1778230339`,
 'pluto-s':`${C}/Pluto_S.png?v=1788356320`,'pluto-m':`${C}/pluto-m_aeb4186d-a814-41a0-83f9-9576dd9ffc7c.png?v=1778959846`,
 'pluto-l':`${C}/pluto-l.png?v=1778959839`,'pluto-xl':`${C}/pluto-xl.png?v=1778959836`,
 'mercury-s':`${C}/mercury-s.png?v=1778960416`,'mercury-m':`${C}/mercury-m_fec7fbee-a325-46f0-8db0-21b5ce4593fb.png?v=1778960425`,
 'mercury-l':`${C}/mercury-l.png?v=1778960418`,'mercury-xl':`${C}/mercury-xl.png?v=1778960422`,
 'jupiter-s':`${C}/jupiter-s.png?v=1778960546`,'jupiter-m':`${C}/jupiter-m.png?v=1778960548`,
 'jupiter-l':`${C}/jupiter-l.png?v=1778960559`,'jupiter-xl':`${C}/jupiter-xl.png?v=1778960551`,
 'saturn-s':`${C}/saturn-s.png?v=1778956432`,'saturn-m':`${C}/saturn-m.png?v=1778956434`,
 'saturn-l':`${C}/saturn-l.png?v=1778956435`,'saturn-xl':`${C}/saturn-xl.png?v=1778956438`,
 'neptune-s':`${C}/neptune-s.png?v=1778958830`,'neptune-m':`${C}/neptune-m.png?v=1778958830`,
 'neptune-l':`${C}/neptune-l.png?v=1778958832`,'neptune-xl':`${C}/neptune-xl.png?v=1778958835`,
 'uranus-s':`${C}/uranus-s.png?v=1778960173`,'uranus-m':`${C}/uranus-m_6eb5b0f5-a939-4be3-afe0-f53308ee45bb.png?v=1778960182`,
 'uranus-l':`${C}/uranus-l.png?v=1778960175`,'uranus-xl':`${C}/uranus-xl.png?v=1778960184`,
 'venus-s':`${C}/venus-s.png?v=1778956065`,'venus-m':`${C}/venus-m.png?v=1778956067`,
 'venus-l':`${C}/venus-l.png?v=1778956068`,'venus-xl':`${C}/venus-xl.png?v=1778956070`,
};
const PL=['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'];
const clsOf=p=>p.tags.includes('class-xl')?'xl':p.tags.includes('class-l')?'l':p.tags.includes('class-m')?'m':p.tags.includes('class-s')?'s':null;

// ── 1) produkty bez media ──
const todo=[]; let total=0, withMedia=0, cursor=null;
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle tags media(first:1){ nodes{ id } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const p of j.data.products.nodes){ total++;
    if(p.media.nodes.length){ withMedia++; continue; }
    const planet=PL.find(x=>p.handle.startsWith(x));
    const cls=clsOf(p); const key=planet&&cls?`${planet}-${cls}`:null;
    if(!key||!IMG[key]){ console.error('BRAK MAPPINGU:',p.handle,p.tags.join(',')); continue; }
    todo.push({id:p.id, handle:p.handle, key});
  }
  if(!j.data.products.pageInfo.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log(`produkty: ${total} | już z media: ${withMedia} | do podpięcia: ${todo.length}`);

// ── 2) gidy plików żywych w bibliotece (match po URL) ──
const gidByURL={}; cursor=null;
for(;;){
  const j=await gql(`query($c:String){ files(first:250, after:$c){ nodes{ ...on MediaImage{ id image{ url } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const f of j.data.files.nodes) if(f.image?.url) gidByURL[f.image.url.split('?')[0]]=f.id;
  if(!j.data.files.pageInfo.hasNextPage) break;
  cursor=j.data.files.pageInfo.endCursor;
}
const needKeys=[...new Set(todo.map(x=>x.key))];
const liveKeys=needKeys.filter(k=>gidByURL[IMG[k].split('?')[0]]);
const deadKeys=needKeys.filter(k=>!gidByURL[IMG[k].split('?')[0]]);
console.log(`klasy w potrzebie: ${needKeys.length} | żywe w bibliotece: ${liveKeys.length} | do dociągnięcia z CDN: ${deadKeys.length}`);

const MUT=`mutation($p:ProductSetInput!){ productSet(input:$p){ product{ id featuredMedia{ ...on MediaImage{ image{ url } } } } userErrors{ field message } } }`;
const report={started:new Date().toISOString(), phaseA:[], phaseB:[], failed:[], rollback:[]};

// ── 3) FAZA A: po jednym produkcie na brakującą klasę, attach przez originalSource ──
for(const key of deadKeys){
  const p=todo.find(x=>x.key===key);
  const res=await gql(MUT,{p:{id:p.id, files:[{originalSource:IMG[key]}]}});
  const ps=res.data?.productSet;
  const url=ps?.product?.featuredMedia?.image?.url;
  if(url){ console.log(`A: ${key} → ${p.handle} → ${url.split('/').pop()}`); report.phaseA.push({key,handle:p.handle,url}); }
  else { console.error(`A-FAIL ${key} ${p.handle}:`,JSON.stringify(ps?.userErrors||res.errors).slice(0,200)); report.failed.push({phase:'A',handle:p.handle,key,err:JSON.stringify((ps?.userErrors||res.errors)).slice(0,200)}); }
  await new Promise(s=>setTimeout(s,500));
}
// poll: pliki z fazy A muszą wjść do biblioteki (by attaches phase B po gid nie były race-y)
for(let i=0;i<20;i++){
  const still=deadKeys.filter(k=>!gidByURL[IMG[k].split('?')[0]]);
  if(!still.length) break;
  for(const k of [...still]){ // rescan
    const j=await gql(`query($q:String!){ files(first:10, query:$q){ nodes{ ...on MediaImage{ id image{ url } } } } }`,{q:`created_at:>2026-09-09`});
    for(const f of j.data.files.nodes) if(f.image?.url) gidByURL[f.image.url.split('?')[0]]=f.id;
  }
  await new Promise(s=>setTimeout(s,2000));
}

// ── 4) FAZA B: attach po gid ──
let doneB=0;
for(let i=0;i<todo.length;i+=30){
  const batch=todo.slice(i,i+30);
  for(const p of batch){
    if(report.phaseA.some(a=>a.handle===p.handle)) continue; // już podpięty w fazie A
    const gid=gidByURL[IMG[p.key].split('?')[0]];
    if(!gid){ report.failed.push({phase:'B',handle:p.handle,key:p.key,err:'brak gida pliku'}); continue; }
    try{
      const res=await gql(MUT,{p:{id:p.id, files:[{id:gid}]}});
      const ps=res.data?.productSet;
      const url=ps?.product?.featuredMedia?.image?.url;
      if(url){ doneB++; report.phaseB.push({handle:p.handle,gid,url}); report.rollback.push({handle:p.handle,gid}); }
      else report.failed.push({phase:'B',handle:p.handle,key:p.key,err:JSON.stringify(ps?.userErrors||res.errors).slice(0,200)});
    }catch(e){ report.failed.push({phase:'B',handle:p.handle,err:String(e).slice(0,200)}); }
    if(doneB%25===0){ fs.writeFileSync(`build/media-restore-wip.json`,JSON.stringify(report,null,1)); process.stdout.write(`\rB: ${doneB} ok, fail=${report.failed.length}   `); }
    await new Promise(s=>setTimeout(s,300));
  }
}
console.log(`\nB koniec: ${doneB}, fail=${report.failed.length}`);

// ── 5) read-back pełny ──
let wm=0, per={}; cursor=null; const samples=[];
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ handle tags media(first:1){ nodes{ ...on MediaImage{ image{ url } } } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const p of j.data.products.nodes){
    const u=p.media.nodes[0]?.image?.url;
    if(u){ wm++; const cls=clsOf(p)||'?'; const planet=PL.find(x=>p.handle.startsWith(x))||'?';
      per[`${planet}-${cls}`]=(per[`${planet}-${cls}`]||0)+1;
      if(samples.length<3) samples.push(`${p.handle} → ${u.split('/').pop().split('?')[0]}`); }
  }
  if(!j.data.products.pageInfo.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log(`READ-BACK: z media ${wm}/${total}`);
console.log('per klasa:', JSON.stringify(per));
samples.forEach(s=>console.log(' sample:',s));
fs.writeFileSync(`build/media-restore-${Date.now()}.json`,JSON.stringify({...report,readBack:{withMedia:wm,total,per}},null,1));
console.log('raport: build/media-restore-*.json | rollback: productDeleteMedia wg manifestu w raporcie');
