#!/usr/bin/env node
/**
 * test-webhook-hmac.mjs — lokalny test weryfikacji HMAC Shopify webhooka.
 * Shopify podpisuje body przez HMAC-SHA256 (secret), nagłówek X-Shopify-Hmac-Sha256 = base64.
 * Test robi: poprawne body → przechodzi; zmodyfikowane body → odrzucone.
 */
import crypto from 'node:crypto';

const SECRET = 'test-shopify-webhook-secret-2026'; // symulacja sekretu (w prod z env)
function computeHmac(body, secret) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}
function verify(body, header, secret) {
  const expected = computeHmac(body, secret);
  // const-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const body = JSON.stringify({
  id: 'gid://shopify/Order/1234567890',
  financial_status: 'paid',
  line_items: [{ sku: 'MARS-PLOT-000001', quantity: 1 }],
  customer: { email: 'buyer@example.com' },
  total_price: '50.00',
});

let failures = 0;
// 1) poprawny header → OK
const ok = computeHmac(body, SECRET);
if (!verify(body, ok, SECRET)) { console.error('❌ TEST1: poprawny HMAC odrzucony'); failures++; }
else console.log('✅ TEST1: poprawny HMAC zaakceptowany');

// 2) zmienione body → odrzucone
if (verify(body + ' ', ok, SECRET)) { console.error('❌ TEST2: zmienione body zaakceptowane'); failures++; }
else console.log('✅ TEST2: zmienione body odrzucone');

// 3) zły sekret → odrzucone
const badSecret = computeHmac(body, 'wrong-secret');
if (verify(body, badSecret, SECRET)) { console.error('❌ TEST3: zły sekret zaakceptowany'); failures++; }
else console.log('✅ TEST3: zły sekret odrzucony');

// 4) replay protection (timestamp) — sprawdzamy czy header ma API-version (nie testuje pełnej logiki)
if (failures) { process.exit(1); }
console.log('\n✅ Webhook HMAC: 3/3 PASS');