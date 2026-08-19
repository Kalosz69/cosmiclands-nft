#!/usr/bin/env node
/**
 * test-worker-locally.mjs — symulacja webhooka Shopify przeciw worker-sync (bez sieci).
 * Sprawdza: HMAC, nie-paid skip, dedup KV, płatny order → pipeline OK.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-sync.mjs'), 'utf8');
// prosta symulacja env z Web Crypto których node ma globalnie? Node ma crypto.subtle globalnie (>=19)
const { handleRequest } = await import('../scripts/worker-sync.mjs');

const SECRET = 'test-webhook-secret';
const env = { WEBHOOK_SECRET: SECRET, STATE: null };

const hmac = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64');
const req = (url, body, headers = {}) => new Request(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

let fails = 0;
async function expect(label, cond) { console.log(`${cond ? '✅' : '❌'} ${label}`); if (!cond) fails++; }

// 1) zły HMAC → 401
const r1 = await handleRequest(req('https://x/webhook/orders', { id: 1 }, { 'X-Shopify-Hmac-Sha256': 'bad' }), env, {});
await expect('zły HMAC → 401', r1.status === 401);

// 2) poprawny HMAC, nie-paid → skipped
const body2 = { id: '12', financial_status: 'pending', line_items: [{ sku: 'MARS-PLOT-000001' }] };
const r2 = await handleRequest(req('https://x/webhook/orders', body2, { 'X-Shopify-Hmac-Sha256': hmac(JSON.stringify(body2)) }), env, {});
await expect('pending → skipped, 200', r2.status === 200 && (await r2.json()).skipped === 'not paid');

// 3) paid z plot → pipeline
const body3 = { id: '99', financial_status: 'paid', email: 'x@y.pl', customer: { first_name: 'J', last_name: 'G' }, line_items: [{ sku: 'MARS-PLOT-000001', quantity: 1 }], total_price: '50' };
const r3 = await handleRequest(req('https://x/webhook/orders', body3, { 'X-Shopify-Hmac-Sha256': hmac(JSON.stringify(body3)) }), env, {});
const j3 = await r3.json();
expect('paid → ok:true', r3.status === 200 && j3.ok === true);
expect('plot wykryty', j3.result?.plotSku === 'MARS-PLOT-000001');

// 4) dedup: stan KV (symulacja prostego mapa)
const KV = { store: {}, async get(k) { return this.store[k] || null; }, async put(k, v) { this.store[k] = v; } };
const env2 = { WEBHOOK_SECRET: SECRET, STATE: KV };
const r4a = await handleRequest(req('https://x/webhook/orders', body3, { 'X-Shopify-Hmac-Sha256': hmac(JSON.stringify(body3)) }), env2, {});
const r4b = await handleRequest(req('https://x/webhook/orders', body3, { 'X-Shopify-Hmac-Sha256': hmac(JSON.stringify(body3)) }), env2, {});
const j4b = await r4b.json();
expect('dedup: druga próba → dedup:true', j4b.dedup === true);

// 5) zdrowotka
const h = await handleRequest(new Request('https://x/health'), env, {});
expect('health 200', h.status === 200);

console.log(fails ? `\n❌${fails} niepowodzeń` : '\n✅ Worker local: 5/5 PASS');
process.exit(fails ? 1 : 0);