// FAZA 0 — inwentaryzacja całego sklepu przed wipe (read-only)
import fs from 'node:fs';
const t = fs.readFileSync('/opt/data/.secrets/shop.txt','utf8');
const secret = t.match(/shpss_[A-Za-z0-9]+/)[0];
const id = t.match(/\b[0-9a-f]{32}\b/)[0];
const r = await fetch('https://rzkhvb-m1.myshopify.com/admin/oauth/access_token', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({client_id:id, client_secret:secret, grant_type:'client_credentials'}),
});
const TOKEN = (await r.json()).access_token;
const gql = async (q,v={}) => {
  const res = await fetch('https://rzkhvb-m1.myshopify.com/admin/api/2026-07/graphql.json', {
    method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body: JSON.stringify({query:q,variables:v})
  });
  if (res.status===429){ await new Promise(s=>setTimeout(s,3000)); return gql(q,v); }
  return res.json();
};
const all = [];
let cursor = null;
for (;;) {
  const res = await gql(`query($c:String){ products(first:250, after:$c){ nodes{ id handle title status productType tags } pageInfo{ hasNextPage endCursor } } }`, {c:cursor});
  const pg = res.data.products;
  all.push(...pg.nodes);
  if (!pg.pageInfo.hasNextPage) break;
  cursor = pg.pageInfo.endCursor;
}
const isPlot = h => /^[a-z]+-plot-\d{4,6}$/.test(h);
const plots = all.filter(p=>isPlot(p.handle));
const others = all.filter(p=>!isPlot(p.handle));
console.log('RAZEM:', all.length, '| plot-products:', plots.length, '| INNE:', others.length);
console.log('\n== INNE (poza wzorcem handle <planet>-plot-<num>): ==');
for (const p of others) console.log(` ${p.handle} | ${p.title} | ${p.status} | type=${p.productType} | tags=${p.tags}`);
// rozkład plotów wg prefiksu planety i bloku numeru
const byPlanet = {};
for (const p of plots) {
  const m = p.handle.match(/^([a-z]+)-plot-(\d+)/);
  const key = `${m[1]}|${m[2].length<=4?'stary':'nowy'}`;
  byPlanet[key] = (byPlanet[key]||0)+1;
}
console.log('\n== ploty planeta|blok =='); console.log(JSON.stringify(byPlanet,null,0));
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync('build/inventory-pre-wipe.json', JSON.stringify({fetched:new Date().toISOString(), total:all.length, plots:plots.length, others:others.map(o=>({handle:o.handle,title:o.title,status:o.status,type:o.productType}))}, null, 1));
console.log('\nzapisano build/inventory-pre-wipe.json');