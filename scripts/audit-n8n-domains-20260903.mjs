// AUDYT #2 read-only: n8n workflows (updated_at) + domena sklepu + metafields kanonu
import fs from 'fs';

const SHOP = 'rzkhvb-m1.myshopify.com';

async function main() {
  // 1. Domena sklepu — dokąd prowadzi BUY
  console.log('=== DOMENY SKLEPU (HEAD/GET status) ===');
  for (const u of ['https://shop.cosmiclands.space/', 'https://cosmiclands.space/', 'https://cosmiclands.space/products/mars-plot-000001', 'https://rzkhvb-m1.myshopify.com/']) {
    try {
      const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
      const ct = (r.headers.get('content-type') || '').split(';')[0];
      const body = ct.startsWith('text/html') ? (await r.text()).slice(0, 300).replace(/\s+/g, ' ') : '';
      console.log(`${r.status} ${ct} | ${u} ${body ? '| ' + body.slice(0, 120) : ''}`);
    } catch (e) { console.log(`ERR | ${u} | ${e.message}`); }
  }

  // 2. n8n workflows
  console.log('\n=== n8n workflows ===');
  try {
    const key = fs.readFileSync('/opt/data/.secrets/n8n.txt', 'utf8').trim().replace(/^(n8n_api_|N8N_API_KEY=)/, '');
    const r = await fetch('https://n8n.cosmiclands.tech/api/v1/workflows?limit=50', {
      headers: { 'X-N8N-API-KEY': key, 'accept': 'application/json' },
    });
    const d = await r.json();
    if (d.data) {
      console.log('workflow count:', d.data.length);
      for (const w of d.data) console.log(`- ${w.name} | active:${w.active} | updated: ${w.updatedAt}`);
    } else {
      console.log('n8n API odpowiedź bez data:', r.status, JSON.stringify(d).slice(0, 200));
    }
  } catch (e) { console.log('n8n ERR:', e.message); }

  // 3. Shopify: metafields kanonu + rozkład planet (czy 120/planetę)
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
  if (!access_token) { console.log('\nShopify: brak tokena — pomijam metafields'); return; }

  const gql = async (query, variables = {}) => {
    const r = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
      body: JSON.stringify({ query, variables }),
    });
    return r.json();
  };
  const res = await gql(`{
    product(handle: "mars-plot-000001") {
      handle status
      metafields(first: 30) { edges { node { namespace key value } } }
    }
    pluto: productsCount(query: "tag:pluto") { count }
    mars: productsCount(query: "tag:mars") { count }
    locked: productsCount(query: "tag:genesis_locked") { count }
  }`);
  const p = res.data?.product;
  console.log('\n=== kanon mars-plot-000001: metafields ===');
  if (p) {
    const mf = p.metafields.edges.map(e => `${e.node.namespace}.${e.node.key}=${e.node.value}`);
    console.log(mf.join('\n') || '(brak metafields)');
  } else console.log('(brak produktu)', JSON.stringify(res.errors || '').slice(0, 200));
  console.log('\nrozkład tagów:', JSON.stringify({ mars: res.data?.mars?.count, pluto: res.data?.pluto?.count, genesis_locked: res.data?.locked?.count }));
}

main().catch(e => { console.error('AUDYT ERROR:', e.message); process.exit(1); });
