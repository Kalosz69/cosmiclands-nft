// final-readback-426.mjs — FAKTY końcowe: ile produktów z media, per planeta-klasa, braki.
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}const j=await res.json();if(j.errors||!j.data){console.error('GraphQL ERR:',JSON.stringify(j).slice(0,200));await new Promise(s=>setTimeout(s,4000));continue;}return j;}};
const PL=['mars','venus','jupiter','saturn','mercury','uranus','neptune','pluto'];
let wm=0,total=0; const per={}; const bez=[]; let cursor=null;
for(;;){
  const j=await gql(`query($c:String){ products(first:250, after:$c){ nodes{ handle tags media(first:1){ nodes{ ...on MediaImage{ image{ url } } } } pageInfo{ hasNextPage endCursor } } } }`,{c:cursor});
  for(const p of j.data.products.nodes){
    total++;
    const u=p.media.nodes[0]?.image?.url;
    if(u){ wm++; const cls=p.tags.includes('class-xl')?'xl':p.tags.includes('class-l')?'l':p.tags.includes('class-m')?'m':'s';
      const planet=PL.find(x=>p.handle.startsWith(x))||'?'; per[`${planet}-${cls}`]=(per[`${planet}-${cls}`]||0)+1; }
    else bez.push(p.handle);
  }
  if(!j.data.products.pageInfo.hasNextPage) break;
  cursor=j.data.products.pageInfo.endCursor;
}
console.log(`PRODUKTY: ${total} | z media: ${wm} | bez: ${bez.length}`);
if(bez.length) console.log('bez media:', bez.join(', '));
const clsKeys=[...new Set(Object.keys(per))];
console.log('klasy pokryte:', clsKeys.length, '| per klasa:');
console.log(JSON.stringify(per));
fs.writeFileSync(`build/final-readback-${Date.now()}.json`,JSON.stringify({total,withMedia:wm,per,bez},null,1));
console.log('raport: build/final-readback-*.json');
