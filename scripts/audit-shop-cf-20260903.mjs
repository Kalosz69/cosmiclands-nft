// AUDYT read-only: stan Shopify + wersje Workera CF (03.09, po incydencie ~04:30-10:46 UTC)
// NIE modyfikuje niczego. Nie echo'uje sekretów (tylko źródło dopasowania + ostatnie 6 znaków ID).
import fs from 'fs';

const SHOP = 'rzkhvb-m1.myshopify.com';
const ACC = 'f0121aafb566d0cfd1cac0289a32eccf';

async function main() {
  // ===== 1. SHOPIFY =====
  const txt = fs.readFileSync('/opt/data/.secrets/shop.txt', 'utf8');
  const kb = fs.readFileSync('/opt/data/workspace/cosmiclands-knowledge/17-indeks-sekretow-endpointow.md', 'utf8');
  const ids = [...new Set([...(txt.match(/\b[0-9a-f]{32}\b/g) || []), ...((kb.match(/`[0-9a-f]{32}`/g) || []).map(s => s.slice(1, -1)))])];
  const secs = [...new Set([...(txt.match(/shpss_[A-Za-z0-9]+/g) || []), ...((kb.match(/shpss_[A-Za-z0-9]+/g) || []))])];
  const at = txt.match(/shpat_[A-Za-z0-9]+/)?.[0] || null;
  const candidates = [];
  for (const id of ids) for (const s of secs) candidates.push({ id, sec: s, src: 'para' });
  if (at) candidates.push({ token: at, src: 'shpat_' });

  let access_token = null, usedSrc = null;
  for (const c of candidates) {
    if (c.token) { access_token = c.token; usedSrc = 'shpat_ z shop.txt'; break; }
    try {
      const tok = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: c.id, client_secret: c.sec, grant_type: 'client_credentials' }),
      });
      if (tok.ok) { const j = await tok.json(); access_token = j.access_token; usedSrc = `para (id …${c.id.slice(-6)})`; break; }
    } catch {}
  }

  if (!access_token) {
    console.log('SHOP: żadna kandydująca para nie daje tokena (kandydatów:', candidates.length + ')');
  } else {
    console.log('SHOP: auth OK przez', usedSrc);
    const gql = async (query, variables = {}) => {
      const r = await fetch(`https://${SHOP}/admin/api/2026-07/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
        body: JSON.stringify({ query, variables }),
      });
      return r.json();
    };
    const c1 = await gql(`{ productsCount { count } }`);
    const c2 = await gql(`{ productsCount(query: "tag:mars-plot") { count } }`);
    const newest = await gql(`{ products(first: 30, reverse: true) { edges { node { handle title status createdAt featuredMedia { id } tags } } } }`);
    const canon = await gql(`{ products(first: 3, query: "handle:mars-plot-000001") { edges { node { handle title status featuredMedia { id } variants(first: 1) { edges { node { sku inventoryQuantity } } } } } } }`);
    console.log('=== SHOPIFY (żywy stan) ===');
    console.log('produkty łącznie:', c1.data?.productsCount?.count, c1.errors ? JSON.stringify(c1.errors).slice(0, 200) : '');
    console.log('z tagiem mars-plot:', c2.data?.productsCount?.count);
    console.log('--- 30 najnowszych (handle | status | img? | created | 2 tagi):');
    for (const e of newest.data?.products?.edges ?? []) {
      const n = e.node;
      console.log(`${n.handle} | ${n.status} | img:${n.featuredMedia ? 'TAK' : 'BRAK'} | ${n.createdAt} | ${(n.tags || []).slice(0, 2).join(',')}`);
    }
    console.log('--- kanon mars-plot-000001:');
    const cn = canon.data?.products?.edges?.[0]?.node;
    if (cn) {
      console.log(`${cn.handle} | ${cn.status} | img:${cn.featuredMedia ? 'TAK' : 'BRAK'} | sku:${cn.variants?.edges?.[0]?.node?.sku} | inv:${cn.variants?.edges?.[0]?.node?.inventoryQuantity}`);
    } else {
      console.log('mars-plot-000001 NIE ISTNIEJE', canon.errors ? JSON.stringify(canon.errors).slice(0, 200) : '');
    }
  }

  // ===== 2. CF WORKER wersje =====
  const cfTxt = fs.readFileSync('/opt/data/.secrets/cloudflar.txt', 'utf8');
  const tokens = [...new Set(cfTxt.match(/[A-Za-z0-9_-]{40,}/g) || [])];
  console.log('\n=== CF WORKER scripts (modified_on) ===');
  for (const t of tokens) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/scripts`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (d.success && Array.isArray(d.result)) {
        for (const s of d.result) console.log(`${s.id} | modified: ${s.modified_on} | created: ${s.created_on}`);
        break;
      }
    } catch {}
  }
}

main().catch(e => { console.error('AUDYT ERROR:', e.message); process.exit(1); });
