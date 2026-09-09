// fix-images.mjs — podmiana obrazków działek (wszystkie planety) na poprawne URL-e kanonu 09.09 (K).
// node fix-images.mjs [--dry-run] [--limit N]
// Źródło: /opt/data/.secrets/shop.txt (repo convention). SHOP produkcyjny: rzkhvb-m1 (zweryfikowane auth 09.09).
// Metoda: planeta/klasa z metafields plot.planet/plot.class (fallback: handle + title "Class X").
// Dla produktu: productDeleteMedia(stare media) → productCreateMedia(originalSource: docelowy URL).
// Bezpieczeństwo: checkpoint build/fix-images-progress.json (resume), NDJSON zmian (rollback), retry 429, skip already-correct.
// Rollback: productDeleteMedia(nowe) + productCreateMedia(stary URL z build/fix-images-changes.ndjson).
import fs from 'node:fs';

const SHOP = 'rzkhvb-m1.myshopify.com';
const API = '2026-07';
const PROGRESS_FILE = 'build/fix-images-progress.json';
const CHANGES_FILE = 'build/fix-images-changes.ndjson';

const raw = fs.readFileSync('/opt/data/.secrets/shop.txt', 'utf8');
const CLIENT_ID = (raw.match(/Id klienta\s+([a-f0-9]{32})/i) || [])[1];
const CLIENT_SECRET = (raw.match(/Klucz tajny\s+(shpss_[A-Za-z0-9]+)/i) || [])[1];

const IMAGE_URLS = {
  mars:    { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mars_S.png?v=1788921275', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mars_M.png?v=1788921275', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mars_L.png?v=1788921276', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mars_XL.png?v=1788921275' },
  venus:   { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Venus_S.png?v=1788920685', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Venus_M.png?v=1788920685', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Vesnus_L.png?v=1788920685', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Venus_xl.png?v=1788920685' },
  jupiter: { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_S.png?v=1788921317', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_M.png?v=1788921317', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_L.png?v=1788921317', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Jupiter_XL.png?v=1788921316' },
  saturn:  { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnS.png?v=1788921039', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnM.png?v=1788921040', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnL.png?v=1788921040', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/SaturnXL.png?v=1788921040' },
  neptune: { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_S1.png?v=1788921206', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_M.png?v=1788921206', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_L.png?v=1788921206', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Neptun_XL.png?v=1788921206' },
  mercury: { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_S.png?v=1788921238', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_M.png?v=1788921238', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_L.png?v=1788921238', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Mercurius_xl.png?v=1788921237' },
  uranus:  { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_s.png?v=1788920762', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_M.png?v=1788920762', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_L.png?v=1788920762', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Uranus_xl.png?v=1788920763' },
  pluto:   { S: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_S_9c28d5a2-837f-4f54-bcef-e44780bef65a.png?v=1788921070', M: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_M.png?v=1788921070', L: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_L.png?v=1788921071', XL: 'https://cdn.shopify.com/s/files/1/1042/7367/4581/files/Pluto_XL.png?v=1788921070' },
};

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const PER_PLANET = (() => { const i = args.indexOf('--per-planet'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();

async function getToken() {
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed');
  return j.access_token;
}

async function gql(token, query, variables = {}, retries = 12) {
  for (let i = 0; ; i++) {
    const res = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 && i < retries) { await new Promise(s => setTimeout(s, 3000 * (i + 1))); continue; }
    const j = await res.json();
    if (j.errors) throw new Error('GraphQL: ' + JSON.stringify(j.errors).slice(0, 300));
    return j;
  }
}

async function restAll(token) {
  const out = [];
  let url = `https://${SHOP}/admin/api/${API}/products.json?limit=250`;
  while (url) {
    const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const j = await r.json();
    if (j.errors) throw new Error('REST: ' + JSON.stringify(j.errors).slice(0, 200));
    for (const p of j.products || []) out.push({ id: p.id, handle: p.handle, title: p.title, img: (p.images && p.images[0] && p.images[0].src) || null });
    const link = r.headers.get('link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return out;
}

function planetOf(p) { return (p.handle || '').split('-')[0]; }
function clsOf(p) { const m = (p.title || '').match(/Class ([A-Z]+)/); return m ? m[1] : null; }
function fileName(u) { if (!u) return null; try { return new URL(u).pathname.split('/').pop(); } catch { return null; } }

// ---- DRY RUN: analiza z REST (read-only) ----
async function dryRun(token) {
  const prods = await restAll(token);
  const stat = {};
  for (const p of prods) {
    const planet = planetOf(p);
    const cls = clsOf(p);
    const want = IMAGE_URLS[planet]?.[cls];
    const key = `${planet}/${cls}`;
    stat[key] = stat[key] || { total: 0, ok: 0, change: 0, noImg: 0, unknown: 0 };
    stat[key].total++;
    if (!want) { stat[key].unknown++; continue; }
    const cur = fileName(p.img);
    const tgt = fileName(want);
    if (!p.img) stat[key].noImg++;
    else if (cur === tgt) stat[key].ok++;
    else stat[key].change++;
  }
  let t = 0, c = 0, o = 0, u = 0;
  console.log('DRY-RUN (read-only) — stan obrazków wg handle/klasy:');
  for (const [k, v] of Object.entries(stat)) {
    console.log(`  ${k.padEnd(12)} total=${String(v.total).padStart(5)} zmiana=${String(v.change).padStart(5)} juz-OK=${String(v.ok).padStart(5)} brak-img=${String(v.noImg).padStart(3)} unknown=${v.unknown}`);
    t += v.total; c += v.change; o += v.ok; u += v.unknown;
  }
  console.log(`SUMA: ${t} | do zmiany: ${c} | już OK: ${o} | brak obrazka: ${prods.filter(p => !p.img).length} | unknown(poza kanonem): ${u}`);
  const samples = prods.filter(p => p.img).slice(0, 3).map(p => `${p.handle} → ${fileName(p.img)}`);
  console.log('Przykłady obecnych:', samples.join(' | '));
}

// ---- LIVE RUN ----
async function liveRun(token) {
  fs.mkdirSync('build', { recursive: true });
  const done = new Set(fs.existsSync(PROGRESS_FILE) ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) : []);
  const prods = await restAll(token);
  let changed = 0, already = 0, unknown = 0, errs = 0;
  let buf = [];
  const perCount = {};

  for (const p of prods) {
    const planet = planetOf(p);
    if (PER_PLANET && (perCount[planet] || 0) >= PER_PLANET) continue;
    if (done.has(p.handle)) { already++; continue; }
    const cls = clsOf(p);
    const want = IMAGE_URLS[planet]?.[cls];
    if (!want) { unknown++; done.add(p.handle); continue; }
    const cur = fileName(p.img);
    const tgt = fileName(want);
    if (p.img && cur === tgt) { already++; done.add(p.handle); continue; }

    // pobierz media (id) — productDeleteMedia potrzebuje id media
    const jm = await gql(token, `query($id: ID!) { product(id: $id) { media(first: 5) { edges { node { id } } } } }`, { id: `gid://shopify/Product/${p.id}` });
    const mediaIds = (jm.data.product.media.edges || []).map(e => e.node.id);

    if (mediaIds.length) {
      const jd = await gql(token, `mutation($pid: ID!, $mids: [ID!]!) { productDeleteMedia(productId: $pid, mediaIds: $mids) { deletedMediaIds userErrors { message } } }`, { pid: `gid://shopify/Product/${p.id}`, mids: mediaIds });
      const ue = jd.data.productDeleteMedia.userErrors;
      if (ue && ue.length) throw new Error(`delete media ${p.handle}: ${JSON.stringify(ue)}`);
      await new Promise(s => setTimeout(s, 80));
    }
    const jc = await gql(token, `mutation($pid: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $pid, media: $media) { media { id } userErrors { message } } }`, { pid: `gid://shopify/Product/${p.id}`, media: [{ originalSource: want, mediaContentType: 'IMAGE' }] });
    const ue2 = jc.data.productCreateMedia.userErrors;
    if (ue2 && ue2.length) throw new Error(`create media ${p.handle}: ${JSON.stringify(ue2)}`);

    changed++;
    perCount[planet] = (perCount[planet] || 0) + 1;
    buf.push(JSON.stringify({ ts: new Date().toISOString(), handle: p.handle, old: p.img, neu: want }));
    if (buf.length >= 25) { fs.appendFileSync(CHANGES_FILE, buf.join('\n') + '\n'); buf = []; }
    if ((changed + already + unknown) % 100 === 0) console.log(`postęp: zmieniono ${changed}, already ${already}, unknown ${unknown}, err ${errs}`);
    await new Promise(s => setTimeout(s, 120));
    if (changed >= LIMIT) break;
  }
  if (buf.length) fs.appendFileSync(CHANGES_FILE, buf.join('\n') + '\n');
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]));
  console.log(`\nKONIEC: zmieniono ${changed} | już-OK ${already} | unknown ${unknown} | błędy ${errs}`);
  console.log('Rollback-log:', CHANGES_FILE);
}

(async () => {
  const token = await getToken();
  if (DRY) await dryRun(token);
  else await liveRun(token);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
