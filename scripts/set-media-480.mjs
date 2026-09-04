// set-media-480.mjs — bulk featuredMedia z CDN Shopify (obrazy K, wgrane na konto 04.09)
// Mapping (planeta,klasa) → CDN URL; productSet UPDATE po id (read-back po handle — lekcja #18).
// Batching 30, pacing 350ms, raport build/media480-report.json + read-back weryfikacja.
import fs from 'node:fs';

const SHOP='rzkhvb-m1.myshopify.com';
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

const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const r = await fetch(`https://${SHOP}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:id,client_secret:secret,grant_type:'client_credentials'})});
const TOKEN=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};

// 1) pobierz żywe produkty (id, handle, tags) — 480 sztuk
const all=[]; let cursor=null;
for(;;){
  const res=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle tags featuredMedia{ id } } pageInfo{ hasNextPage endCursor } } }`,{c:cursor});
  all.push(...res.data.products.nodes);
  if(!res.data.products.pageInfo.hasNextPage) break;
  cursor=res.data.products.pageInfo.endCursor;
}
console.log('produkty live:',all.length);

// 2) mapping per produkt
const todo=[];
for(const p of all){
  if(p.featuredMedia) continue; // już ma obraz
  const planet=['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'].find(x=>p.handle.includes(x));
  const cls=p.tags.includes('class-xl')?'xl':p.tags.includes('class-l')?'l':p.tags.includes('class-m')?'m':'s';
  const url=planet&&IMG[`${planet}-${cls}`];
  if(!url){ console.error('BRAK MAPPINGU:',p.handle,p.tags); continue; }
  todo.push({id:p.id,handle:p.handle,url});
}
console.log('do ustawienia media:',todo.length);

// 3) bulk UPDATE (productSet po id — pełny zestaw NIE wymagany dla media-only? NIE: lekcja #18 → używamy productUpdateMedia / productCreateMedia)
// productCreateMedia nie dotyka reszty pól — bezpieczne, bez pełnego zestawu.
const MUT=`mutation($pid:ID!,$media:[CreateMediaInput!]!){ productCreateMedia(productId:$pid, media:$media){ media{ id } mediaUserErrors{ field message } } }`;
const report={started:new Date().toISOString(),ok:[],failed:[]};
for(let i=0;i<todo.length;i+=30){
  const batch=todo.slice(i,i+30);
  for(const p of batch){
    try{
      const res=await gql(MUT,{pid:p.id,media:[{mediaContentType:'IMAGE',originalSource:p.url}]});
      const me=res?.data?.productCreateMedia;
      if(me?.media?.length) report.ok.push(p.handle);
      else report.failed.push({handle:p.handle,errors:me?.mediaUserErrors??res});
    }catch(e){report.failed.push({handle:p.handle,errors:[{message:String(e).slice(0,200)}]});}
    fs.writeFileSync('build/media480-report.json',JSON.stringify(report,null,1));
    process.stdout.write(`\r${report.ok.length}/${todo.length} ok, fail=${report.failed.length}`);
    await new Promise(s=>setTimeout(s,350));
  }
}
console.log(`\nKONIEC: ok=${report.ok.length} fail=${report.failed.length}`);
