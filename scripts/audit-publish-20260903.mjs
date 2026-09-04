// AUDYT #4 read-only: publikacja do Online Store + tagi produktów locked + kolekcje
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
  if (!access_token) { console.log('Shopify: brak tokena'); return; }

  const gql = async (query, variables = {}) => {
    const r = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
      body: JSON.stringify({ query, variables }),
    });
    return r.json();
  };

  // 1. mars-plot-000001: publikacje (kanały) + pełne tagi
  const res = await gql(`{
    p1: products(first: 1, query: "handle:mars-plot-000001") { edges { node { handle tags resourcePublications(first: 10) { edges { node { isPublished publication { name } } } } } } }
    # produkt bez tagu available (pluto 120 = locked)
    p2: products(first: 2, query: "handle:pluto-plot-000120") { edges { node { handle tags status resourcePublications(first: 10) { edges { node { isPublished publication { name } } } } } } }
    # kolekcje w sklepie
    cols: collections(first: 20) { edges { node { title handle productsCount { count } } } }
    # czy którykolwiek produkt jest opublikowany
    pub: productsCount(query: "published_status:published") { count }
    unpub: productsCount(query: "published_status:unpublished") { count }
  }`);
  const n1 = res.data?.p1?.edges?.[0]?.node;
  console.log('=== mars-plot-000001 ===');
  if (n1) {
    console.log('tags:', JSON.stringify(n1.tags));
    console.log('publicationsCount:', n1.publicationsCount?.count, '| kanały:', (n1.publications?.edges ?? []).map(e => e.node.name).join(', ') || '(BRAK — nieopublikowany)');
  }
  const n2 = res.data?.p2?.edges?.[0]?.node;
  console.log('\n=== pluto-plot-000120 (locked) ===');
  if (n2) console.log('tags:', JSON.stringify(n2.tags), '| status:', n2.status, '| pubCount:', n2.publicationsCount?.count);

  console.log('\n=== publikacja sklepu ===');
  console.log('published:', res.data?.pub?.count, '| unpublished:', res.data?.unpub?.count);
  console.log('\n=== kolekcje ===');
  for (const e of res.data?.cols?.edges ?? []) console.log(`- ${e.node.title} (${e.node.handle}) — ${e.node.productsCount?.count} produktów`);
  if (res.errors) console.log('GQL errors:', JSON.stringify(res.errors).slice(0, 300));
}

main().catch(e => { console.error('AUDYT ERROR:', e.message); process.exit(1); });
