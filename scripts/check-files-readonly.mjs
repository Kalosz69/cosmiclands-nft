// check-files-readonly.mjs — INWENTARYZACJA read-only biblioteki Files (Shopify Admin GraphQL)
// Cel: ile plików w Content>Files, które osierocone (nie używane przez 426 produktów K-line),
//      grupy wg daty/statusu/rozmiaru. ZERO mutacji. Raport: build/files-inventory-<ts>.json
import fs from 'node:fs';

const SHOP='rzkhvb-m1.myshopify.com';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const r = await fetch(`https://${SHOP}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:id,client_secret:secret,grant_type:'client_credentials'})});
const TOKEN=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};

// 1) cała biblioteka Files
const files=[]; let cursor=null;
for(;;){
  const res=await gql(`query($c:String){ files(first:250, after:$c){ nodes{ ... on MediaImage{ id alt createdAt fileStatus preview{ image{ url width height } } } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  if(res.errors){ console.error('GraphQL error (files):', JSON.stringify(res.errors).slice(0,300)); break; }
  files.push(...(res.data?.files?.nodes||[]));
  if(!res.data?.files?.pageInfo.hasNextPage) break;
  cursor=res.data.files.pageInfo.endCursor;
}
console.log('pliki w bibliotece Files:', files.length);

// 2) media żywych produktów (featuredMedia + pozostałe media)
const prodMedia=new Set(); const prodCount={products:0, withFeatured:0, otherMedia:0}; let pcursor=null;
for(;;){
  const res=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id featuredMedia{ id } media(first:20){ nodes{ id } } } pageInfo{ hasNextPage endCursor } } }`,{c:pcursor});
  if(res.errors){ console.error('GraphQL error (products):', JSON.stringify(res.errors).slice(0,300)); break; }
  const nodes=res.data?.products?.nodes||[];
  prodCount.products+=nodes.length;
  for(const p of nodes){
    if(p.featuredMedia){ prodMedia.add(p.featuredMedia.id); prodCount.withFeatured++; }
    for(const m of p.media.nodes) if(m.id!==p.featuredMedia?.id){ prodMedia.add(m.id); prodCount.otherMedia++; }
  }
  if(!res.data?.products?.pageInfo.hasNextPage) break;
  pcursor=res.data.products.pageInfo.endCursor;
}
console.log('produkty:', prodCount.products, '| z featuredMedia:', prodCount.withFeatured, '| dodatkowe media:', prodCount.otherMedia);

// 3) klasyfikacja
const orphan=files.filter(f=>!prodMedia.has(f.id));
const used=files.filter(f=>prodMedia.has(f.id));
const byDay={};
for(const f of orphan){ const d=(f.createdAt||'').slice(0,10); byDay[d]=(byDay[d]||0)+1; }
const report={ generatedAt:new Date().toISOString(), filesTotal:files.length, usedByProducts:used.length, orphaned:orphan.length, byDay, orphanIds:orphan.map(f=>({id:f.id, createdAt:f.createdAt, status:f.fileStatus, alt:f.alt||null, url:f.preview?.image?.url||null})) };
fs.mkdirSync('build',{recursive:true});
const out=`build/files-inventory-${new Date().toISOString().replace(/[:T]/g,'-').slice(0,19)}.json`;
fs.writeFileSync(out, JSON.stringify(report,null,2));
console.log('raport:', out);
console.log('UŻYWANE przez produkty:', used.length, '| OSIEROCONE:', orphan.length);
console.log('osierocone wg dnia utworzenia:', JSON.stringify(byDay));
// podgląd pierwszych 5 URL-i osieroconych (plikowa nazwa, bez tokenów)
for(const f of orphan.slice(0,5)) console.log('  przyklid:', f.createdAt, (f.preview?.image?.url||'').split('/').pop(), '| alt:', f.alt);
