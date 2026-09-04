// AUDYT #5 read-only: updatedAt produktów (czy ruszane po imporcie 02.09 13:06?)
import fs from 'fs';
const SHOP = 'rzkhvb-m1.myshopify.com';

async function main() {
  const txt = fs.readFileSync('/opt/data/.secrets/shop.txt', 'utf8');
  const kb = fs.readFileSync('/opt/data/workspace/cosmiclands-knowledge/17-indeks-sekretow-endpointow.md', 'utf8');
  const ids = [...new Set([...(txt.match(/\b[0-9a-f]{32}\b/g) || []), ...((kb.match(/`[0-9a-f]{32}`/g) || []).map(s => s.slice(1, -1)))])];
  const secs = [...new Set([...(txt.match(/shpss_[A-Za-z0-9]+/g) || []), ...((kb.match(/shpss_[A-Za-z0-9]+/g) || []))])];
  let access_token = null;
  for (const id of ids) {
    for (const s of secs) {
      try {
        const tok = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: id, client_secret: s, grant_type: 'client_credentials' }),
        });
        if (tok.ok) { access_token = (await tok.json()).access_token; break; }
      } catch {}
    }
    if (access_token) break;
  }
  if (!access_token) { console.log('brak tokena'); return; }
  const gql = async (query) => {
    const r = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
      body: JSON.stringify({ query }),
    });
    return r.json();
  };

  const res = await gql(`{
    fresh: productsCount(query: "updated_at:>=2026-09-02T13:20:00Z") { count }
    today: productsCount(query: "updated_at:>=2026-09-03T00:00:00Z") { count }
    newest: products(first: 3, sortKey: UPDATED_AT, reverse: true) { edges { node { handle updatedAt } } }
    sample: products(first: 3, query: "handle:mars-plot-000001 OR handle:pluto-plot-000120 OR handle:venus-plot-000060") { edges { node { handle updatedAt publishedAt } } }
  }`);
  console.log('zmodyfikowane po 02.09 13:20 UTC:', res.data?.fresh?.count);
  console.log('zmodyfikowane dzisiaj (03.09):', res.data?.today?.count);
  console.log('3 najnowsze updatedAt:');
  for (const e of res.data?.newest?.edges ?? []) console.log(`  ${e.node.handle} | ${e.node.updatedAt}`);
  console.log('sample (publishedAt = kiedy opublikowane):');
  for (const e of res.data?.sample?.edges ?? []) console.log(`  ${e.node.handle} | upd:${e.node.updatedAt} | pub:${e.node.publishedAt ?? 'NIGDY'}`);
  if (res.errors) console.log('errors:', JSON.stringify(res.errors).slice(0, 200));
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
