// restore-media-attach-c.mjs — DOKOŃCZENIE: 26 produktów bez media (mercury-m ×13, uranus-m ×13).
// Retry attach przez originalSource na 1 produkcie/klasę → poll biblioteki (60s) → attach po gid.
import fs from 'node:fs';

const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};

const C='https://cdn.shopify.com/s/files/1/1042/7367/4581/files';
const KEYS={
 'mercury-m':`${C}/mercury-m_fec7fbee-a325-46f0-8db0-21b5ce4593fb.png?v=1778960425`,
 'uranus-m':`${C}/uranus-m_6eb5b0f5-a939-4be3-afe0-f53308ee45bb.png?v=1778960182`,
};

// ── produkty bez media ──
const todo=[]; let cursor=null;
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle tags media(first:1){ nodes{ id } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const p of j.data.products.nodes){
    if(p.media.nodes.length) continue;
    const planet=['mercury','uranus'].find(x=>p.handle.startsWith(x));
    const cls=p.tags.includes('class-m')?'m':null;
    if(planet&&cls&&KEYS[`${planet}-${cls}`]) todo.push({id:p.id,handle:p.handle,key:`${planet}-${cls}`});
  }
  if(!j.data.products.pageInfo.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log('bez media (m-klasy):', todo.length, todo.map(x=>x.handle).slice(0,4).join(','),'…');

const MUT=`mutation($p:ProductSetInput!){ productSet(input:$p){ product{ id featuredMedia{ ...on MediaImage{ image{ url } } } } userErrors{ field message } } }`;

// ── retry originalSource per klasa ──
for(const key of Object.keys(KEYS)){
  const p=todo.find(x=>x.key===key);
  if(!p) continue;
  const res=await gql(MUT,{p:{id:p.id, files:[{originalSource:KEYS[key]}]}});
  console.log(`retry ${key} → ${p.handle}:`, res.data?.productSet?.userErrors?.[0]?.message ?? 'userErrors=[] (async)');
  await new Promise(s=>setTimeout(s,1000));
}
// ── poll biblioteki (max 90s) ──
const gidByURL={};
let ok=false;
for(let i=0;i<18;i++){
  let cursor2=null;
  for(;;){
    const j=await gql(`query($c:String){ files(first:250, after:$c){ nodes{ ...on MediaImage{ id image{ url } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor2});
    for(const f of j.data.files.nodes) if(f.image?.url) gidByURL[f.image.url.split('?')[0]]=f.id;
    if(!j.data.files.pageInfo.hasNextPage) break;
    cursor2=j.data.files.pageInfo.endCursor;
  }
  ok=Object.keys(KEYS).every(k=>gidByURL[KEYS[k].split('?')[0]]);
  if(ok) break;
  await new Promise(s=>setTimeout(s,5000));
}
console.log('pliki m-klas w bibliotece:', ok?'TAK':'NIE (po 90s)', '| mercury-m gid:', gidByURL[KEYS['mercury-m'].split('?')[0]]||'BRAK', '| uranus-m gid:', gidByURL[KEYS['uranus-m'].split('?')[0]]||'BRAK');

// ── attach po gid (albo po originalSource jako fallback) ──
const report={started:new Date().toISOString(), ok:[], failed:[]};
for(const p of todo){
  const fileIn=gidByURL[KEYS[p.key].split('?')[0]];
  const filesArg=fileIn?[{id:fileIn}]:[{originalSource:KEYS[p.key]}];
  try{
    const res=await gql(MUT,{p:{id:p.id, files:filesArg}});
    const url=res.data?.productSet?.product?.featuredMedia?.image?.url;
    if(url) report.ok.push({handle:p.handle,url});
    else report.failed.push({handle:p.handle,err:JSON.stringify(res.data?.productSet?.userErrors||res.errors).slice(0,200)});
  }catch(e){ report.failed.push({handle:p.handle,err:String(e).slice(0,200)}); }
  await new Promise(s=>setTimeout(s,300));
}
console.log(`attach: ok=${report.ok.length} fail=${report.failed.length}`);
report.failed.forEach(x=>console.log(' FAIL', x.handle, x.err));

// ── read-back finalny (wszystkie 426) ──
let wm=0; const per={}; const PL=['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'];
cursor=null; const bez=[];
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ handle tags media(first:1){ nodes{ ...on MediaImage{ image{ url } } } } pageInfo{ hasNextPage endCursor } } } }`,{c:cursor});
  for(const p of j.data.products.nodes){
    const u=p.media.nodes[0]?.image?.url;
    if(u){ wm++; const cls=p.tags.includes('class-xl')?'xl':p.tags.includes('class-l')?'l':p.tags.includes('class-m')?'m':'s';
      const planet=PL.find(x=>p.handle.startsWith(x))||'?'; per[`${planet}-${cls}`]=(per[`${planet}-${cls}`]||0)+1; }
    else bez.push(p.handle);
  }
  if(!j.data.products.pageInfo.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log(`READ-BACK FINAL: z media ${wm}/426`);
console.log('per klasa:', JSON.stringify(per));
if(bez.length) console.log('bez media:', bez.join(', '));
fs.writeFileSync(`build/media-restore-c-${Date.now()}.json`,JSON.stringify({...report,readBack:{withMedia:wm,per}},null,1));
console.log('raport: build/media-restore-c-*.json');
