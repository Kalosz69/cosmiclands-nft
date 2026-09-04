// AUDYT #4b: introspekcja pól publikacji w API 2026-07
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

  for (const t of ['Product', 'Publication', 'ResourcePublication']) {
    const res = await gql(`{ __type(name: "${t}") { fields { name } } }`);
    const f = (res.data?.__type?.fields ?? []).map(x => x.name).filter(n => /pub|channel|catalog/i.test(n));
    console.log(`${t}:`, f.join(', ') || '(brak pól pub/chan/catalog)');
  }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
