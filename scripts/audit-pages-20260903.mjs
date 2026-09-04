// AUDYT #6 read-only: strony (pages) sklepu — gdzie siedzi stara mapa 10k
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

  const res = await gql(`{ pages(first: 20) { edges { node { title handle createdAt updatedAt bodySummary } } } }`);
  console.log('=== PAGES sklepu ===');
  for (const e of res.data?.pages?.edges ?? []) console.log(`- ${e.node.handle} | "${e.node.title}" | upd:${e.node.updatedAt}`);
  if (res.errors) console.log('errors:', JSON.stringify(res.errors).slice(0, 200));

  // menu nawigacja (gdzie prowadzi MAP)
  const menu = await gql(`{ menus(first: 10) { edges { node { title handle items { title url } } } } }`);
  console.log('\n=== MENU ===');
  for (const e of menu.data?.menus?.edges ?? []) {
    console.log(`menu: ${e.node.title} (${e.node.handle})`);
    for (const it of e.node.items) console.log(`   ${it.title} -> ${it.url}`);
  }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
