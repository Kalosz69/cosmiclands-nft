// READ-ONLY: pełny spis handle'ów Mars (pagination) — liczba + dziury w numeracji
import fs from 'fs';
const SHOP='rzkhvb-m1.myshopify.com';
const txt=fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const kb=fs.readFileSync('/opt/data/workspace/cosmiclands-knowledge/17-indeks-sekretow-endpointow.md','utf8');
const ids=[...new Set([...(txt.match(/\b[0-9a-f]{32}\b/g)||[]),...((kb.match(/`[0-9a-f]{32}`/g)||[]).map(s=>s.slice(1,-1)))])];
const secs=[...new Set([...(txt.match(/shpss_[A-Za-z0-9]+/g)||[]),...((kb.match(/shpss_[A-Za-z0-9]+/g)||[]))])];
let token=null;
for(const id of ids){for(const s of secs){try{const t=await fetch(`https://${SHOP}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:id,client_secret:s,grant_type:'client_credentials'})});if(t.ok){token=(await t.json()).access_token;break}}catch{}}if(token)break}
if(!token){console.log('brak tokena');process.exit(1)}
const gql=async(q,v={})=>{const r=await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query:q,variables:v})});return r.json()};

async function allHandles(prefix){
  let after=null; const out=[];
  while(true){
    const res=await gql(`query($after:String){ products(first:250, after:$after, query:"handle:${prefix}-plot-*"){ nodes{handle} pageInfo{hasNextPage endCursor} } }`,{after});
    const p=res.data?.products; if(!p){ console.log('GraphQL err', JSON.stringify(res).slice(0,200)); break; }
    out.push(...p.nodes.map(n=>n.handle));
    if(!p.pageInfo.hasNextPage) break; after=p.pageInfo.endCursor;
  }
  return out;
}

const mars=await allHandles('mars');
console.log('mars handle count:', mars.length);
const nums=mars.map(h=>parseInt(h.split('-').pop(),10)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
const missing=[]; for(let i=1;i<=60;i++){ if(!nums.includes(i)) missing.push(String(i).padStart(6,'0')); }
console.log('mars 1..60 brakujace:', missing.join(', ')||'BRAK (pełne 60)');
console.log('mars poza 1..60:', nums.filter(n=>n<1||n>60).length);
