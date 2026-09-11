#!/usr/bin/env node
/**
 * poller.mjs — Cosmic Lands Post-Purchase Orchestrator v1 (biblia 22).
 * Pętla 60 s: Shopify orders (paid, test) → per line_item:
 *   mint DeedV2 → grant COSMO → PDF premium v3 → email (SMTP hello@ → odbiorca z configu).
 * Wywołuje PRZETESTOWANE skrypty jako subprocessy (zero modyfikacji testowanego kodu).
 * Idempotencja: state.json processed[] + evidence scan (istniejący tx/pdf = skip kroku).
 * Sekrety: tylko z .secrets (wallet file, SMTP) — w kodzie ZERO kluczy.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Efektywny dry-run (K 01.09): config LUB flaga CLI — chroni CAŁE pollOnce (mint/evidence/state),
// nie tylko banner. Przed naprawą flaga --dry-run dotykała tylko banera i poller mintował realnie.
const DRY = cfg.dry_run === true || process.argv.includes('--dry-run');

// Fallback sekretu OAuth (K 01.09): gdy brak env SHOPIFY_CLIENT_SECRET, czytaj z pliku
// (unikamy klasy błędu "start bez exportu → OAuth 400"). Sekret nie trafia do logów.
if (!process.env.SHOPIFY_CLIENT_SECRET && cfg.client_secret_file) {
  try {
    const m = readFileSync(cfg.client_secret_file, 'utf8').match(/shpss_[a-f0-9]+/);
    if (m) process.env.SHOPIFY_CLIENT_SECRET = m[0];
  } catch { /* brak pliku — zostaje env (może pusty) */ }
}

const STATE_PATH = path.join(__dirname, 'state.json');
const EVIDENCE = path.join(__dirname, 'evidence');
const LOGS = path.join(__dirname, 'logs');
const SCRIPTS = path.join(ROOT, 'scripts');

// ── CHAINID_GUARD (twardy, jak w skryptach) ─────────────────────────────
const CHAIN_ID = Number(cfg.chain_id);
if (CHAIN_ID !== 84532) { console.error(`CHAINID_GUARD: oczekiwano 84532, jest ${CHAIN_ID} — STOP`); process.exit(1); }

// ── Sekrety (nigdy w kodzie ani configu) ────────────────────────────────
function smtpPass() {
  const lines = readFileSync(cfg.smtp_pass_file, 'utf8').split(/\r?\n/);
  const pw = (lines[cfg.smtp_pass_line - 1] || '').trim();
  if (!pw) throw new Error('SMTP pass brak');
  return pw;
}
function seedPhrase() {
  const raw = readFileSync(cfg.wallet_file, 'utf8').split(/\r?\n/);
  const li = raw.findIndex(l => /^secret:/i.test(l.trim()));
  const phrase = (li >= 0 ? raw[li].replace(/^secret:\s*/i, '').trim() : '') || raw.slice(li + 1).find(l => l.trim())?.trim();
  if (!phrase) throw new Error('Seed phrase brak');
  return phrase;
}
// PRIVATE_KEY dla mint: derivacja z seed (jak deploy-with-seed). Wykonanie w subprocessie:
// mint-test.mjs czyta PRIVATE_KEY z env — podajemy przez env subprocessa (nie logujemy).
function privateKeyFromPhrase(phrase) {
  // synchroniczna derivacja ethers v6 bez async: HDNodeWallet.fromPhrase nie jest sync-friendly w ESM top-level
  // → delegujemy do małego helpera przez node -e (ethers z node_modules ROOT)
  const out = execFileSync(process.execPath, ['-e', `
    const { HDNodeWallet } = require('${ROOT.replace(/'/g, "\\'")}/node_modules/ethers');
    const fs = require('fs');
    const w = HDNodeWallet.fromPhrase(fs.readFileSync(0, 'utf8').trim());
    process.stdout.write(w.privateKey);
  `], { input: phrase, encoding: 'utf8' });
  return out.trim();
}

// ── Logging ─────────────────────────────────────────────────────────────
function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  console.log(line);
  try { appendFileSync(path.join(LOGS, `${new Date().toISOString().slice(0, 10)}.log`), line + '\n'); } catch {}
}
const logStream = (level, buf) => String(buf).split('\n').filter(Boolean).forEach(l => log(level, `  | ${l}`));

// ── State (atomic) ──────────────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_PATH)) return { last_checked_at: null, processed: [] };
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}
function saveState(s) {
  const tmp = STATE_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, STATE_PATH);
}

// ── Shopify OAuth (client_credentials, per run — token ma krótki TTL) ───
let TOKEN = null, TOKEN_EXP = 0;
async function shopifyToken() {
  if (TOKEN && Date.now() < TOKEN_EXP - 60_000) return TOKEN;
  const r = await fetch(`https://${cfg.shop_domain}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cfg.client_id, client_secret: process.env.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error(`OAuth fail ${r.status}`);
  const j = await r.json();
  TOKEN = j.access_token; TOKEN_EXP = Date.now() + (j.expires_in || 3600) * 1000;
  log('INFO', `OAuth OK (TTL ${Math.round((TOKEN_EXP - Date.now()) / 1000)} s)`);
  return TOKEN;
}

// ── Shopify REST ────────────────────────────────────────────────────────
async function shopifyGet(pathQ) {
  const t = await shopifyToken();
  const r = await fetch(`https://${cfg.shop_domain}/admin/api/${cfg.api_version}${pathQ}`, {
    headers: { 'X-Shopify-Access-Token': t } });
  if (!r.ok) throw new Error(`Shopify GET ${pathQ} → ${r.status}`);
  return r.json();
}

async function paidOrders(sinceIso) {
  const q = `/orders.json?financial_status=paid&status=any&limit=50` +
    (sinceIso ? `&created_at_min=${encodeURIComponent(sinceIso)}` : '');
  const { orders } = await shopifyGet(q);
  return orders || [];
}

// Klasa + region działki: metafields plot.* (źródło prawdy, pokrywa 10k); fallback: tag class-*
async function resolveClass(item, orderId) {
  const sku = item.sku || '';
  const fallback = { cls: null, region: null };
  try {
    const { products } = await shopifyGet(`/products.json?ids=${item.product_id}&fields=id`);
    if (products?.length) {
      const { metafields } = await shopifyGet(`/products/${products[0].id}/metafields.json`);
      const mf = Object.fromEntries((metafields || []).filter(m => m.namespace === 'plot').map(m => [m.key, m.value]));
      const cls = String(mf.class || '').toUpperCase();
      if (cls && cfg.cosmo_by_class[cls]) return { cls, region: mf.region || null };
      if (cls) throw new Error(`Klasa spoza kanonu: ${cls} (${sku})`);
    }
  } catch (e) { log('WARN', `metafields lookup fail (${e.message}) — próbuję tagi`); }
  const tags = (item.tags || '').split(',').map(s => s.trim().toLowerCase());
  const t = tags.find(x => /^class-(s|m|l|xl)$/.test(x));
  if (t) return { cls: t.split('-')[1].toUpperCase(), region: null };
  throw new Error(`Nie umiem ustalić klasy dla SKU ${sku} (order ${orderId})`);
}

// FIX 2026-09-07 (bug K): certyfikat wychodził z „coords —" bo poller hardcodował '—'.
// Współrzędne działki są w KV (worker /api/map) — fetch per SKU, cache per run.
async function plotCoords(sku) {
  try {
    const now = Date.now();
    if (!plotCoords._cache || !plotCoords._ts || now - plotCoords._ts > 60000) {
      const res = await fetch(cfg.worker_url || 'https://cosmiclands-sync.flufy69happy.workers.dev/api/map?light=1');
      const j = await res.json();
      plotCoords._cache = new Map((j.plots || []).map(p => [String(p.plot_id || '').toUpperCase(), [p.lat, p.lon]]));
      plotCoords._ts = now;
    }
    const c = plotCoords._cache.get(String(sku || '').toUpperCase());
    if (!c || c[0] == null || c[1] == null) return '—';
    return `${c[0]}, ${c[1]}`;
  } catch (e) { log('WARN', `plotCoords(${sku}): ${e.message.slice(0, 60)}`); return '—'; }
}

// ── Wallet resolution (K 01.09 + Shopify spec) ──────────────────────────
// Puste pole wallet_address → ZAWSZE Cosmic Bank (0xb66A…055A), niezależnie od wallet_mode.
// 0xD197…E880 (test_wallet) NIE jest już auto-adresem — tylko ręcznie podany w checkoucie ( DIRECT_WALLET).
function resolveWallet(order) {
  const attr = (order.note_attributes || []).find(a => a.name === 'wallet_address')?.value?.trim();
  if (attr) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(attr)) throw new Error(`Zły format wallet_address: ${attr}`);
    return { address: attr, mode: 'DIRECT_WALLET' };
  }
  return { address: cfg.treasury_wallet, mode: 'COSMIC_BANK' };
}

// ── On-chain pre-check mintu (K 01.09, case #1021) ──────────────────────
// Plot może już istnieć (testy batch4/sell-all 27.08, Etap B). Zamiast crasha ×3
// na "plot already minted": odczyt plotToToken/ownerOf i świadoma decyzja.
const deedRead = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const require = createRequire(import.meta.url);
    const { ethers } = require(path.join(ROOT, 'node_modules', 'ethers'));
    const artifact = JSON.parse(readFileSync(path.join(ROOT, 'build', 'CosmicLandsDeed.json'), 'utf8'));
    const state = JSON.parse(readFileSync(path.join(ROOT, 'build', 'deployed-deed.json'), 'utf8'));
    const addr = cfg.deed_addr || state.address;
    cached = { contract: new ethers.Contract(addr, artifact.abi, new ethers.JsonRpcProvider(cfg.rpc_url)), addr };
    return cached;
  };
})();

async function existingMint(sku, wantWallet) {
  // Zwraca { exists, tokenId, owner } — null gdy plot wolny.
  try {
    const { contract } = deedRead();
    const tid = await contract.plotToToken(sku);
    if (tid === 0n || tid.toString() === '0') return null;
    return { exists: true, tokenId: tid.toString(), owner: (await contract.ownerOf(tid)).toLowerCase(), want: wantWallet.toLowerCase() };
  } catch (e) {
    log('WARN', `pre-check ${sku} fail (${e.message.slice(0, 80)}) — lecę mintem jak v1`);
    return null;
  }
}

// Oryginalny tx mintu istniejącego tokenu (do cross-refu na certyfikacie). Chunk-scan 9k bloków.
async function findMintTx(tokenId) {
  try {
    const require = createRequire(import.meta.url);
    const { ethers } = require(path.join(ROOT, 'node_modules', 'ethers'));
    const artifact = JSON.parse(readFileSync(path.join(ROOT, 'build', 'CosmicLandsDeed.json'), 'utf8'));
    const state = JSON.parse(readFileSync(path.join(ROOT, 'build', 'deployed-deed.json'), 'utf8'));
    const addr = cfg.deed_addr || state.address;
    const p = new ethers.JsonRpcProvider(cfg.rpc_fallback);
    const c = new ethers.Contract(addr, artifact.abi, p);
    const latest = await p.getBlockNumber();
    for (let end = latest; end > latest - 250000; end -= 9000) {
      const start = Math.max(end - 8999, 0);
      const ev = await c.queryFilter(c.filters.Transfer(null, null, tokenId), start, end).catch(() => []);
      if (ev.length) return ev[0].transactionHash;
    }
  } catch (e) { log('WARN', `findMintTx(${tokenId}): ${e.message.slice(0, 60)}`); }
  return null;
}

// ── Subprocess runner (przetestowane skrypty) ───────────────────────────
function runScript(script, env, args, label) {
  log('INFO', `RUN ${label}: node ${path.relative(ROOT, path.join(SCRIPTS, script))} ${args.join(' ')}`);
  const out = execFileSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180_000,
  });
  logStream('INFO', out);
  return out;
}

// ── Evidence ────────────────────────────────────────────────────────────
function evDir(orderId) { return path.join(EVIDENCE, String(orderId)); }
function evPath(orderId, name) { return path.join(evDir(orderId), name); }
function evRead(orderId, name) {
  try { return readFileSync(evPath(orderId, name), 'utf8').trim(); } catch { return null; }
}
function evWrite(orderId, name, content) {
  mkdirSync(evDir(orderId), { recursive: true });
  writeFileSync(evPath(orderId, name), content);
}

// ── Processing ──────────────────────────────────────────────────────────
function withRetry(fn, label, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try { return fn(); } catch (e) {
      log('ERROR', `[RETRY ${i}/${retries}] ${label}: ${e.message}`);
      if (i === retries) throw e;
      const sleep = 5000 * i;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleep);
    }
  }
}

async function processOrder(order, state) {
  const orderId = String(order.id);
  if (state.processed.includes(orderId)) return;
  log('INFO', `=== ORDER ${order.name} (${orderId}) test=${order.test} items=${order.line_items.length}`);

  // order.json evidence raz (tylko realny tryb; dry-run nie tworzy evidence)
  if (!DRY && !existsSync(evPath(orderId, 'order.json'))) {
    evWrite(orderId, 'order.json', JSON.stringify(order, null, 2));
  }

  const { address: wallet, mode } = resolveWallet(order);
  const to = cfg.mail_to;

  for (const item of order.line_items) {
    const sku = item.sku;
    const { cls, region } = await resolveClass(item, orderId);
    const coordsStr = await plotCoords(sku);
    const grant = cfg.cosmo_by_class[cls];
    if (!grant) throw new Error(`Brak grantu dla klasy ${cls} (${sku})`);
    log('INFO', `ITEM ${sku}: class=${cls} grant=${grant} wallet=${wallet} (${mode}) region=${region || '—'}`);

    if (DRY) {
      log('INFO', `DRY-RUN ${sku}: mint(${wallet}) → grant ${grant} COSMO → PDF → email ${to} (zero transakcji)`);
      continue;
    }

    // [1] MINT (skip jeśli evidence ma tx) — mint-test.mjs: env PLOT, BUYER, TOKEN_URI opcjonalny
    let mintTx = evRead(orderId, 'mint_tx.txt');
    let tokenId = evRead(orderId, 'token_id.txt');
    if (!mintTx && !tokenId) {
      const pre = await existingMint(sku, wallet);
      if (pre?.exists && pre.owner === pre.want) {
        // [A] Plot już on-chain u właściwego ownera (testy 27.08 batch4/sell-all) — adoptuję, zero mintu.
        log('INFO', `MINT SKIP ${sku}: już on-chain tokenId=${pre.tokenId} owner=${pre.owner} — adoptuję (pre-check)`);
        const origTx = await findMintTx(pre.tokenId);
        tokenId = pre.tokenId;
        mintTx = origTx || `adopted:${pre.tokenId}`;
        evWrite(orderId, 'token_id.txt', tokenId);
        evWrite(orderId, 'mint_tx.txt', mintTx);
      } else if (pre?.exists && pre.owner === cfg.treasury_wallet.toLowerCase() && mode === 'DIRECT_WALLET') {
        // [B] Plot w banku (0xb66A), klient podał swój portfel → TRANSFER bank→klient (claim).
        // Bank podpisuje (seed = klucz 0xb66A, owner kontraktu Deed). Potem normalny łańcuch: grant+PDF+email bez noty bankowej.
        log('INFO', `TRANSFER ${sku}: tokenId=${pre.tokenId} bank→${wallet} (claim z banku)`);
        const pkT = privateKeyFromPhrase(seedPhrase());
        const outT = withRetry(() => runScript('transfer-deed.mjs', {
          PRIVATE_KEY: pkT, NETWORK: 'base-sepolia',
          PLOT: sku, TO: wallet,
        }, [], `transfer ${sku} bank→${wallet}`), 'transfer');
        const mT = outT.match(/tx=(0x[0-9a-fA-F]{64})/);
        if (!mT) throw new Error('Transfer: nie odczytano tx z stdout');
        tokenId = pre.tokenId;
        mintTx = mT[1];
        evWrite(orderId, 'token_id.txt', tokenId);
        evWrite(orderId, 'mint_tx.txt', mintTx);
        log('INFO', `TRANSFER OK ${sku} (${tokenId}) → ${wallet} tx=${mintTx}`);
      } else if (pre?.exists) {
        // [C] Double-sell: zmintowany poza bankiem/u innego — NIE mintuję, NIE grantuję; decyzja K.
        log('ERROR', `DOUBLE-SELL ${sku}: on-chain owner=${pre.owner}, zamówienie oczekiwało ${pre.want} — item pominięty (zero mintu/grantu); evidence double_sell.txt, decyzja K (transfer vs remint)`);
        evWrite(orderId, 'double_sell.txt', JSON.stringify({ sku, onchain_owner: pre.owner, expected: pre.want, token_id: pre.tokenId }));
        continue;
      }
    }
    if (!mintTx) {
      const pk = privateKeyFromPhrase(seedPhrase());
      const out = withRetry(() => runScript('mint-test.mjs', {
        PRIVATE_KEY: pk, NETWORK: 'base-sepolia',
        PLOT: sku, BUYER: wallet,
        DEED_ADDR: cfg.deed_addr || undefined,
      }, [], `mint ${sku} → ${wallet}`), 'mint');
      // mint-test drukuje "tx=0x…"
      const m = out.match(/tx=(0x[0-9a-fA-F]{64})/);
      if (!m) throw new Error(`Mint: nie odczytano tx z stdout`);
      mintTx = m[1];
      evWrite(orderId, 'mint_tx.txt', mintTx);
      const t = out.match(/ownerOf\((\d+)\)/);
      if (t) { tokenId = t[1]; evWrite(orderId, 'token_id.txt', tokenId); }
      log('INFO', `MINT OK ${sku} → ${wallet} tx=${mintTx}${tokenId ? ` tokenId=${tokenId}` : ''}`);
      // UWAGA v1: mint-test.mjs mintuje na plot z PLOT env — ustawiamy poniżej przed uruchomieniem (patrz TODO v1.1)
    }

    // [2] GRANT COSMO
    let cosmoTx = evRead(orderId, 'cosmo_tx.txt');
    if (!cosmoTx) {
      const out = withRetry(() => runScript('grant-cosmo.mjs', {},
        ['--to', wallet, '--amount', String(grant)], `grant ${grant} → ${wallet}`), 'grant');
      const m = out.match(/tx=(0x[0-9a-fA-F]{64})/);
      if (!m) throw new Error(`Grant: nie odczytano tx`);
      cosmoTx = m[1];
      evWrite(orderId, 'cosmo_tx.txt', cosmoTx);
      log('INFO', `GRANT OK ${grant} COSMO → ${wallet} tx=${cosmoTx}`);
    }

    // [3] PDF premium v3 (skip jeśli evidence pdf)
    let pdfPath = evRead(orderId, 'pdf_path.txt');
    if (!pdfPath || !existsSync(pdfPath)) {
      const outDir = path.join(ROOT, 'test-output');
      mkdirSync(outDir, { recursive: true });
      pdfPath = path.join(outDir, `${sku}-${orderId}.pdf`);
      withRetry(() => runScript('generate-certificate-v3.mjs', {},
        ['--planet', sku.split('-')[0].toLowerCase(), '--plot', sku,
         '--owner', cfg.owner_name, '--class', cls, '--region', region || (item.properties?.Region) || '—',
         '--coords', coordsStr, '--area', cfg.class_meta[cls]?.area || '—',
         '--price', cfg.class_meta[cls]?.price || '—', '--cosmo', String(grant),
         '--cert', `CL-TEST-${orderId}`, '--token-id', String(tokenId || '0'), '--tx', mintTx,
         '--out', pdfPath], `pdf ${sku}`), 'pdf');
      evWrite(orderId, 'pdf_path.txt', pdfPath);
      log('INFO', `PDF OK ${pdfPath}`);
    }

    // [4] EMAIL
    let msgId = evRead(orderId, 'email_msgid.txt');
    if (!msgId && cfg.email_enabled === false) {
      log('WARN', `EMAIL SKIP (${sku}): email_enabled=false (np. blokada IP SMTP) — dokończy kolejny obieg`);
    } else if (!msgId) {
      const emailArgs = ['--to', to, '--plot', sku, '--pdf', pdfPath];
      if (mode === 'COSMIC_BANK') emailArgs.push('--bank');
      const out = withRetry(() => runScript('send-email.mjs', {
        SMTP_HOST: cfg.smtp_host, SMTP_PORT: String(cfg.smtp_port), SMTP_USER: cfg.smtp_user,
        SMTP_PASS: smtpPass(), SMTP_SECURE: 'false',
      }, emailArgs, `email ${sku} → ${to}${mode === 'COSMIC_BANK' ? ' [+Cosmic Bank notice]' : ''}`), 'email');
      const m = out.match(/msgId\s+(\S+)/);
      msgId = m ? m[1] : 'unknown';
      evWrite(orderId, 'email_msgid.txt', msgId);
      log('INFO', `EMAIL OK → ${to} msgId=${msgId}`);
    }
  }

  // processed[] tylko w realnym trybie (dry-run nie modyfikuje state — generalna próba nie zużywa kolejki)
  if (!DRY) {
    state.processed.push(orderId);
    saveState(state);
  }
  log('INFO', `=== ORDER ${order.name} DONE (processed[])`);
}

// ── Main loop ───────────────────────────────────────────────────────────
async function pollOnce() {
  const state = loadState();
  if (!existsSync(LOGS)) mkdirSync(LOGS, { recursive: true });
  const since = state.last_checked_at;
  const orders = await paidOrders(since);
  log('INFO', `POLL: ${orders.length} paid orders (since=${since || 'start'})`);
  for (const o of orders) {
    try { await processOrder(o, state); }
    catch (e) { log('ERROR', `ORDER ${o.name}: ${e.message} — pozostaje w kolejce (MT-12)`); }
  }
  state.last_checked_at = new Date().toISOString();
  saveState(state);
}

// ── Pre-flight in-code: saldo gas ───────────────────────────────────────
async function gasBalance() {
  const r = await fetch(cfg.rpc_fallback, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
      params: [cfg.treasury_wallet, 'latest'] }) });
  const j = await r.json();
  return parseInt(j.result, 16) / 1e18;
}

// ── Entry ───────────────────────────────────────────────────────────────
const once = process.argv.includes('--once');
if (DRY) {
  log('INFO', 'DRY-RUN: pokażę plan działań, zero transakcji (flaga dry_run w config.json / --dry-run).');
}
const bal = await gasBalance();
log('INFO', `Gas treasury: ${bal.toFixed(4)} ETH`);
if (bal < cfg.min_gas_eth) { log('ERROR', `Za mało gazu (${bal} < ${cfg.min_gas_eth}) — STOP`); process.exit(1); }

log('INFO', `🚀 Cosmic Lands Orchestrator v1 start (puste wallet_address → Cosmic Bank ${cfg.treasury_wallet.slice(0,7)}…${cfg.treasury_wallet.slice(-4)}, mail=${cfg.mail_to}, dry_run=${DRY})`);
if (once) {
  await pollOnce();
} else {
  await pollOnce();
  setInterval(() => pollOnce().catch(e => log('ERROR', `poll: ${e.message}`)), cfg.poll_ms);
}
