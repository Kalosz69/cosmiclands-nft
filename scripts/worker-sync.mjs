/**
 * worker-sync.mjs — Cloudflare Worker: odbiór Shopify webhooka + pipeline NFT/PDF/COSMO.
 *
 * Wdrożenie (wrangler): worker jako module worker, env:
 *   SHOPIFY_WEBHOOK_SECRET, RESEND_API_KEY, PRIVATE_KEY (Base), DEED_ADDR, COSMO_ADDR,
 *   PINATA_JWT, PINATA_GATEWAY, RESEND_FROM, RPC_URL (Base), BASE_CHAIN_ID
 *
 * Endpointy: POST /webhook/order (Shopify)
 * Test: node scripts/test-worker-locally.mjs (symulacja bez sieci)
 */

// ── Crypto helpers (Web Crypto, dostepne w Workers; dla nodejs uzyj crypto) ──
async function hmacSha256(secret, body) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/webhook/orders') {
    return handleWebhook(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, ts: Date.now() });
  }
  return json({ error: 'not found' }, 404);
}

async function handleWebhook(request, env) {
  const raw = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256') || '';
  const expected = await hmacSha256(env.WEBHOOK_SECRET, raw);
  if (hmac !== expected) return json({ error: 'bad hmac' }, 401);

  let order;
  try { order = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
  if (order.financial_status !== 'paid') return json({ ok: true, skipped: 'not paid' });

  // dedupe (idempotencja): Cloudflare KV z keyem order.id
  const dedupeKey = `order:${order.id}`;
  if (env.STATE) {
    const prev = await env.STATE.get(dedupeKey);
    if (prev === 'done') return json({ ok: true, dedup: true });
  }

  const plot = firstPlot(order);
  if (!plot) return json({ ok: true, skipped: 'no plot' });

  const result = {
    orderId: order.id,
    plotSku: plot.sku,
    email: order.email,
    owner: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
    // placeholdery na kroki sieciowe (mint, ipfs, email) — wykonuja sie po deployu
    mintTx: null, certPdf: null, cosmoGrant: null,
  };

  if (env.STATE) await env.STATE.put(dedupeKey, 'done');
  return json({ ok: true, result: result });
}

function firstPlot(order) {
  for (const li of order.line_items || []) {
    const sku = li.sku || '';
    if (/^MARS-PLOT-\d{6}$/.test(sku)) return li;
  }
  return null;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json' },
});

export default { fetch: handleRequest };