// check-state-after-cleanup.mjs — READ-ONLY odczyt stanu po ręcznej kasacji K (09.09 ~01:20+)
// 1) biblioteka Files: ile plików, jakie nazwy → porównanie z kanonem 32 (set-media-480)
// 2) produkty 426: ile ma media (media first:1, NIE featuredMedia — lekcja z odczytu 01:11),
//    rozkład wg planety/klasy, podpięte nazwy plików
// Zero mutacji. Raport: build/state-after-cleanup-<ts>.json
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});
  if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}
  const j=await res.json(); if(j.errors) throw new Error('GraphQL: '+JSON.stringify(j.errors).slice(0,300)); return j;}};

// --- 1) FILES ---
let cursor=null; const files=[];
for(;;){
  const j=await gql(`query($c:String){ files(first:200, after:$c, sortKey:CREATED_AT, reverse:true){ nodes{ ...on MediaImage{ id createdAt alt image{ url } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  files.push(...j.data.files.nodes.map(f=>({id:f.id, createdAt:f.createdAt, name:f.image?.url?.split('/').pop()?.split('?')[0]||'(brak)', alt:f.alt})));
  if(!j.data.files.pageInfo.hasNextPage) break;
  cursor=j.data.files.pageInfo.endCursor;
}
console.log('FILES w bibliotece:', files.length);
const byName={}; for(const f of files) byName[f.name]=(byName[f.name]||0)+1;
const names=Object.keys(byName).sort();
for(const n of names) console.log('  '+n+(byName[n]>1?` (x${byName[n]})`:''));

// --- 2) PRODUKTY ---
cursor=null; let withMedia=0, noMedia=0; const perClass={}; const attachedNames={}; const noMediaSample=[];
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ handle tags media(first:1){ nodes{ ...on MediaImage{ image{ url } } } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  for(const p of j.data.products.nodes){
    const m=p.media.nodes[0];
    if(m){ withMedia++;
      const n=m.image?.url?.split('/').pop()?.split('?')[0]||'(brak)';
      attachedNames[n]=(attachedNames[n]||0)+1;
      const cls=p.tags.includes('class-xl')?'xl':p.tags.includes('class-l')?'l':p.tags.includes('class-m')?'m':'s';
      perClass[cls]=perClass[cls]||{}; perClass[cls].with=(perClass[cls].with||0)+1;
    } else { noMedia++;
      const cls=p.tags.includes('class-xl')?'xl':p.tags.includes('class-l')?'l':p.tags.includes('class-m')?'m':'s';
      perClass[cls]=perClass[cls]||{}; perClass[cls].without=(perClass[cls].without||0)+1;
      if(noMediaSample.length<8) noMediaSample.push(p.handle);
    }
  }
  if(!j.data.products.pageInfo.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log(`\nPRODUKTY (tag cosmic-lands): z media=${withMedia} | bez media=${noMedia}`);
console.log('per klasa:', JSON.stringify(perClass));
console.log('podpięte nazwy plików:', JSON.stringify(attachedNames, null, 1).slice(0,800));
console.log('sample bez media:', noMediaSample.join(', '));

const ts=new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
fs.writeFileSync(`build/state-after-cleanup-${ts}.json`, JSON.stringify({ts, files, products:{withMedia,noMedia,perClass,attachedNames}}, null, 1));
console.log(`\nraport: build/state-after-cleanup-${ts}.json`);
