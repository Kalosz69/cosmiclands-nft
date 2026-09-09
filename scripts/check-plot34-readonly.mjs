// READ-ONLY: sprawdź w Shopify, czy istnieje produkt mars-plot-000034 (i jupiter-plot-000034)
// Używa tej samej logiki tokena co audit-publish-20260903.mjs (sekrety NIE są printowane).
import fs from 'fs';

const SHOP = 'rzkhvb-m1.myshopify.com';

async function getToken() {
  const txt = fs.readFileSync('/opt/data/.secrets/shop.txt', 'utf8');
  const kb = fs.readFileSync('/opt/data/workspace/cosmiclands-knowledge/17-indeks-sekretow-endpointow.md', 'utf8');
  const ids = [...new Set([...(txt.match(/\b[0-9a-f]{32}\b/g) || []), ...((kb.match(/`[0-9a-f]{32}`/g) || []).map(s => s.slice(1, -1)))])];
  const secs = [...new Set([...(txt.match(/shpss_[A-Za-z0-9]+/g) || []), ...((kb.match(/shpss_[A-Za-z0-9]+/g) || []))])];
  for (const id of ids) {
    for (const s of secs) {
      try {
        const tok = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: id, client_secret: s, grant_type: 'client_credentials' }),
        });
        if (tok.ok) return (await tok.json()).access_token;
      } catch {}
    }
  }
  return null;
}

const token = await getToken();
if (!token) { console.log('Shopify: brak tokena'); process.exit(1); }

const gql = async (query, variables = {}) => {
  const r = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  return (await r.json());
};

const q = `query($q: String!) { products(first: 5, query: $q) { nodes { handle title status publishedOnCurrentPublication totalInventory } } }`;

for (const handle of ['mars-plot-000034', 'jupiter-plot-000034', 'mars-plot-000013']) {
  const res = await gql(q, { q: `handle:${handle}` });
  const nodes = res?.data?.products?.nodes || [];
  console.log(handle, '→', nodes.length ? JSON.stringify(nodes.map(n => ({ handle: n.handle, status: n.status, published: n.publishedOnCurrentPublication, inv: n.totalInventory }))) : 'BRAK w Shopify');
}
