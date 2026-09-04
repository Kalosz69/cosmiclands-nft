// AUDYT #3 read-only: czy strona produktu to brama hasła? metafields przez products(query:), rozkład tagów
import fs from 'fs';

const SHOP = 'rzkhvb-m1.myshopify.com';

async function main() {
  // 1. Czy /products/... to brama hasła czy realny produkt?
  console.log('=== TREŚĆ STRONY PRODUKTU (diagnoza password-gate) ===');
  for (const u of ['https://cosmiclands.space/products/mars-plot-000001', 'https://shop.cosmiclands.space/products/mars-plot-000001']) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const t = await r.text();
      const hasPassword = /password protection|store is password|input.*name="password"/i.test(t);
      const hasTitle = /Mars Plot #000001/i.test(t);
      const hasBuy = /buy this plot|add to cart|Buy/i.test(t);
      console.log(`${u}\n  status:${r.status} | password-gate:${hasPassword} | tytuł produktu:${hasTitle} | przycisk kupna:${hasBuy} | len:${t.length}`);
    } catch (e) { console.log(u, 'ERR', e.message); }
  }

  // 2. Shopify GraphQL
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

  const res = await gql(`{
    p1: products(first: 1, query: "handle:mars-plot-000001") { edges { node { handle status featuredMedia { id } variants(first: 1) { edges { node { sku inventoryQuantity price } } } metafields(first: 30) { edges { node { namespace key value } } } } } }
    mars: productsCount(query: "tag:mars") { count }
    pluto: productsCount(query: "tag:pluto") { count }
    venus: productsCount(query: "tag:venus") { count }
    locked: productsCount(query: "tag:genesis_locked") { count }
    avail: productsCount(query: "tag:available") { count }
  }`);
  const node = res.data?.p1?.edges?.[0]?.node;
  console.log('\n=== mars-plot-000001 (products query) ===');
  if (node) {
    console.log(`handle:${node.handle} | status:${node.status} | img:${node.featuredMedia ? 'TAK' : 'BRAK'} | sku:${node.variants?.edges?.[0]?.node?.sku} | inv:${node.variants?.edges?.[0]?.node?.inventoryQuantity} | price:${node.variants?.edges?.[0]?.node?.price}`);
    console.log('metafields:');
    for (const e of node.metafields?.edges ?? []) console.log(`  ${e.node.namespace}.${e.node.key} = ${e.node.value}`);
  } else console.log('(brak)', JSON.stringify(res.errors || '').slice(0, 300));
  console.log('\nrozkład tagów:', JSON.stringify({
    mars: res.data?.mars?.count, venus: res.data?.venus?.count, pluto: res.data?.pluto?.count,
    genesis_locked: res.data?.locked?.count, available: res.data?.avail?.count,
  }));
}

main().catch(e => { console.error('AUDYT ERROR:', e.message); process.exit(1); });
