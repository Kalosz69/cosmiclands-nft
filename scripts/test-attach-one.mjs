// test-attach-one.mjs — TEST na JEDNYM produkcie (GO K 09.09 obejmuje krok 2 = attach).
// mars-plot-000001 + plik biblioteczny mars-plot-s.jpg (FileSetInput.id).
// Read-back: featuredMedia.url. Rollback: productDeleteMedia(gid z read-back).
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret=t.match(/shpss_[A-Za-z0-9]+/)[0], cid=t.match(/\b[0-9a-f]{32}\b/)[0];
const r=await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cid,client_secret:secret,grant_type:'client_credentials'})});
const T=(await r.json()).access_token;
const gql=async(q,v={})=>{for(;;){const res=await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},body:JSON.stringify({query:q,variables:v})});if(res.status===429){await new Promise(s=>setTimeout(s,3000));continue;}return res.json();}};

const p=await gql('{ products(first:1, query:"handle:mars-plot-000001"){ nodes{ id handle } } }');
const pid=p.data.products.nodes[0]?.id; console.log('produkt:', pid);

let gid=null,c=null;
for(;;){
  const j=await gql(`query($c:String){ files(first:200, after:$c){ nodes{ ...on MediaImage{ id image{ url } } } pageInfo{ hasNextPage endCursor } } }`,{c});
  const hit=j.data.files.nodes.find(f=>f.image?.url?.includes('mars-plot-s.jpg'));
  if(hit){gid=hit.id; break;}
  if(!j.data.files.pageInfo.hasNextPage) break;
  c=j.data.files.pageInfo.endCursor;
}
console.log('plik gid:', gid);
if(!pid||!gid){ console.log('BRAK wejścia'); process.exit(1); }

const res=await gql(`mutation($p:ProductSetInput!){ productSet(input:$p){ product{ id featuredMedia{ ...on MediaImage{ image{ url } } } } userErrors{ field message } } }`,
  {p:{id:pid, files:[{id:gid}]}});
const ps=res.data?.productSet;
console.log('WYNIK attach:', ps?.product?.featuredMedia?.image?.url || JSON.stringify(ps?.userErrors||res.errors).slice(0,400));
