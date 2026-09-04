#!/usr/bin/env node
/**
 * mint-reserve-batch.mjs — masowy mint rezerwatu (mintReserveBatch) + depozyt COSMO do banku.
 *
 * Źródło danych: manifest planety (mars-manifest.json) — realne działki z tagiem
 * `nature_reserve` (numeracja 8001–10000 = rezerwat Genesis). NIE syntetyczne ID!
 * Pilot: onlyPlanet=Mars. Pozostałe 7 planet po wygenerowaniu ich pełnych manifestów
 * (potrzebne: build-planets-manifest na pełne 10k/planetę + aktualizacja workera/KV).
 *
 * Działki idą PROSTO DO BANKU (CosmoBankVault): mintReserveBatch(vault, ...).
 * unlockAt per token = 1.01.2036 (Mars, okno D2: 10 lat).
 * COSMO: pełne pakiety Genesis (100/300/900/2700 wg klasy) → depositCosmo do vaulta.
 * Kontrola sum: suma COSMO w manifeście dla rezerwatu == 1 160 000 (tokenomika v2).
 *
 * Użycie:
 *   node scripts/mint-reserve-batch.mjs                # DRY-RUN (nic nie wysyła)
 *   node scripts/mint-reserve-batch.mjs --apply        # wykonanie rzeczywiste
 *   BATCH=500 node scripts/mint-reserve-batch.mjs --apply
 * Wymagane do --apply: NETWORK=base-sepolia, kontrakty w build/deployed-*.json.
 */
import { ethers, HDNodeWallet } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PLANET = process.env.ONLY_PLANET || 'mars';
const BATCH = Number(process.env.BATCH || 100); // 100 ≈ 15M gas — mieści się w estymatorze publicznego RPC i w każdym bloku

const NETWORKS = {
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  'base': { chainId: 8453, rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
};
const network = process.env.NETWORK || 'base-sepolia';
const cfg = NETWORKS[network];
if (cfg.chainId !== 84532) throw new Error('CHAINID_GUARD: dozwolona WYŁĄCZNIE Base Sepolia (84532) — testy. Mainnet zablokowany.');
if (!cfg) throw new Error(`Nieznana sieć: ${network}`);

// --- sekrety jak w deploy-vault.mjs ---
function loadMnemonic() {
  const raw = fs.readFileSync('/opt/data/.secrets/trust walet.txt', 'utf8');
  const lines = raw.split(/\r?\n/);
  const i = lines.findIndex(l => /^secret:/i.test(l.trim()));
  if (i < 0) throw new Error('Brak sekcji secret w pliku sekretów');
  const inline = lines[i].replace(/^secret:\s*/i, '').trim();
  const phrase = inline || lines.slice(i + 1).find(l => l.trim())?.trim();
  if (!phrase || phrase.split(/\s+/).length !== 12) throw new Error('Nieprawidłowa fraza seed (oczekiwano 12 słów)');
  return phrase;
}
function loadWallet(provider) {
  // NonceManager: chroni przed kolizją nonce przy szybkich sekwencyjnych tx
  return new ethers.NonceManager(HDNodeWallet.fromPhrase(loadMnemonic())).connect(provider);
}

function deployed(name) {
  const f = path.join(root, 'build', `deployed-${name}.json`);
  if (!fs.existsSync(f)) throw new Error(`Brak ${f} — najpierw deploy ${name}`);
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.network !== network) throw new Error(`${name}: deployed na '${j.network}', próbujesz na '${network}'`);
  return j.address;
}
const deedAddr = ethers.getAddress(process.env.DEED_ADDRESS || deployed('deed'));
const vaultAddr = ethers.getAddress(process.env.VAULT_ADDRESS || deployed('vault'));
const cosmoAddr = ethers.getAddress(process.env.COSMO_ADDRESS || deployed('cosmo'));

// --- dane: manifest planety ---
const manifestFile = process.env.MANIFEST || `mars-manifest.json`;
const mm = JSON.parse(fs.readFileSync(path.join(root, manifestFile), 'utf8'));
const plots = mm.filter(p => {
  const t = String(p.tags || '');
  if (!t.split(',').map(s => s.trim()).includes('nature_reserve')) return false;
  const num = parseInt(String(p.plot_id).replace(/\D/g, ''), 10);
  if (!(num >= 8001 && num <= 10000)) return false; // podwójna kontrola
  return String(p.mf_planet || p.planet).toLowerCase() === PLANET;
});
if (plots.length !== 2000) {
  throw new Error(`Oczekiwano 2000 działek rezerwatu ${PLANET}, znaleziono ${plots.length} — ABORT`);
}

// --- rozpiska klas + suma kontrolna tokenomiki ---
const FULL_PACKAGES = { S: 100, M: 300, L: 900, XL: 2700 };
const perClass = {};
let cosmoSum = 0n;
for (const p of plots) {
  const cls = String(p.mf_class || p.class || '').toUpperCase();
  const amt = BigInt(p.mf_cosmo_tokens ?? FULL_PACKAGES[cls] ?? 0);
  if (![100n, 300n, 900n, 2700n].includes(amt)) throw new Error(`${p.plot_id}: nieoczekiwany pakiet COSMO ${amt}`);
  cosmoSum += amt;
  perClass[cls] = (perClass[cls] || 0) + 1;
}
console.log(`Rezerwat ${PLANET}: ${plots.length} działek | klasy:`, perClass, `| COSMO razem: ${cosmoSum}`);
if (cosmoSum !== 1160000n) {
  throw new Error(`Suma COSMO rezerwatu ${cosmoSum} ≠ 1 160 000 (tokenomika v2) — ABORT`);
}

// --- unlock: Mars = 2036-01-01 UTC ---
const UNLOCK_MARS_2036 = 2082758400;
const unlockTs = Number(process.env.UNLOCK_TS || UNLOCK_MARS_2036);
if (unlockTs <= Math.floor(Date.now() / 1000)) throw new Error(`UNLOCK_TS ${unlockTs} nie jest przyszły`);

// --- przygotowanie paczek (posortowane po numerze działki) ---
plots.sort((a, b) => parseInt(a.plot_number, 10) - parseInt(b.plot_number, 10));
const chunks = [];
for (let i = 0; i < plots.length; i += BATCH) {
  const slice = plots.slice(i, i + BATCH);
  chunks.push({
    ids: slice.map(p => String(p.plot_id)),
    uris: slice.map(p => `ipfs://RESERVE/${String(p.plot_id)}.json`),
    n: slice.length,
    cosmo: slice.reduce((a, p) => a + BigInt(p.mf_cosmo_tokens), 0n),
  });
}
console.log(`Paczek: ${chunks.length} × ≤${BATCH} | vault: ${vaultAddr} | deed: ${deedAddr}`);

if (!APPLY) {
  console.log('\nDRY-RUN — nic nie wysłano. Uruchom z --apply po akceptacji Kapitana.');
  for (const [i, c] of chunks.entries()) {
    console.log(`  paczka ${i + 1}: ${c.n} działek (${c.ids[0]} … ${c.ids[c.ids.length - 1]}), COSMO pakietów: ${c.cosmo}`);
  }
  console.log(`Razem do depozytu COSMO: ${cosmoSum} (jeśli wallet ma supply; inaczej: mint z trezora przed deposit)`);
  process.exit(0);
}

// ================= APPLY =================
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || cfg.rpc);
const wallet = loadWallet(provider);
const deployer = await wallet.getAddress();
console.log(`\nAPPLY na ${network} (${cfg.chainId}) jako ${deployer}`);
const bal = await provider.getBalance(deployer);
console.log(`Balans gazu deployera: ${ethers.formatEther(bal)} ETH`);

const deedArt = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmicLandsDeedV2.json'), 'utf8'));
const deed = new ethers.Contract(deedAddr, deedArt.abi, wallet);

// (opcjonalny) sanity-check on-chain plotToToken dla pierwszego ID — musi być wolny
const probe = chunks[0].ids[0];
const existingToken = await deed.plotToToken(probe);
if (existingToken !== 0n && (await deed.exists(existingToken))) {
  throw new Error(`${probe} już zamintowany on-chain (token ${existingToken}) — ABORT (konflikt ID)`);
}
console.log(`Probe ${probe}: wolny ✓`);
const mintedBefore = await deed.totalMinted();
const mintedAfter = mintedBefore + BigInt(plots.length);

const logPath = path.join(root, 'build', 'reserve-batch-log.json');
const log = { network, chainId: cfg.chainId, vault: vaultAddr, planet: PLANET, startedAt: new Date().toISOString(), txs: [] };

// --- A) batch mint → bank ---
const NO_URI = process.env.NO_URI === '1'; // mint bez per-token URI (metadata później przez setBaseURI)
if (NO_URI) for (const c of chunks) c.uris = c.ids.map(() => ''); // "" = kontrakt pomija _setTokenURI
for (const [i, c] of chunks.entries()) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let gasLimit;
      try {
        const est = await deed.mintReserveBatch.estimateGas(vaultAddr, c.ids, c.uris, unlockTs);
        gasLimit = (est * 115n) / 100n;
      } catch {
        // publiczne RPC capują estymatę (~30M) — fallback: wyliczenie z pomiaru ~148k/plot + zapas
        gasLimit = BigInt(Math.round(c.n * 165000 * 1.25));
        console.log(`paczka ${i + 1}/${chunks.length}: ${c.n} działek — estimate niedostępny, gasLimit z wzorca: ${Number(gasLimit).toLocaleString('pl-PL')}`);
      }
      console.log(`paczka ${i + 1}/${chunks.length}: ${c.n} działek, gasLimit=${Number(gasLimit).toLocaleString('pl-PL')}`);
      const tx = await deed.mintReserveBatch(vaultAddr, c.ids, c.uris, unlockTs, { gasLimit });
      const rc = await tx.wait();
      if (rc.status !== 1) throw new Error(`tx REVERT: ${rc.hash}`);
      console.log(`  ✅ tx ${rc.hash} (block ${rc.blockNumber})`);
      log.txs.push({ kind: 'mintBatch', chunk: i + 1, count: c.n, first: c.ids[0], last: c.ids[c.ids.length - 1], hash: rc.hash, block: rc.blockNumber });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`  ⚠️ próba ${attempt}/3: ${String(e.message).slice(0, 160)}`);
      try { await wallet.reset?.(); } catch {} // NonceManager: synchronizacja nonce po odrzuconej tx
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
  if (lastErr) { log.failedAt = `chunk ${i + 1}`; fs.writeFileSync(logPath, JSON.stringify(log, null, 2)); throw lastErr; }
}

// --- B) COSMO do banku (depositCosmo) ---
const cosmoArt = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmoToken.json'), 'utf8'));
const vaultArt = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmoBankVault.json'), 'utf8'));
const cosmo = new ethers.Contract(cosmoAddr, cosmoArt.abi, wallet);
const vault = new ethers.Contract(vaultAddr, vaultArt.abi, wallet);
const cosmoAmount = ethers.parseUnits(String(cosmoSum), 18); // manifest podaje tokeny, ERC-20 ma 18 decimals
const wb = await cosmo.balanceOf(deployer);
console.log(`COSMO w portfelu operacyjnym: ${ethers.formatUnits(wb, 18)} / do wpłaty: ${ethers.formatUnits(cosmoAmount, 18)}`);
if (wb < cosmoAmount) {
  console.error(`❌ BRAK COSMO: brakuje ${ethers.formatUnits(cosmoAmount - wb, 18)} — wpłata pominięta (skrypt kończy się tutaj; mint z trezora wymaga osobnej decyzji)`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  process.exit(2);
}
await (await cosmo.approve(vaultAddr, cosmoAmount)).wait();
const depTx = await vault.depositCosmo(cosmoAmount);
const depRc = await depTx.wait();
if (depRc.status !== 1) throw new Error(`depositCosmo REVERT: ${depRc.hash}`);
console.log(`✅ COSMO wpłacone do banku: ${ethers.formatUnits(cosmoAmount, 18)} — tx ${depRc.hash}`);
log.txs.push({ kind: 'approve', amount: cosmoAmount.toString() }, { kind: 'depositCosmo', amount: cosmoAmount.toString(), hash: depRc.hash });

// --- C) weryfikacja powykonawcza (on-chain) ---
const vaultCosmo = await cosmo.balanceOf(vaultAddr);
const totalMinted = await deed.totalMinted();
const first = chunks[0].ids[0];
const last = chunks[chunks.length - 1].ids[chunks[chunks.length - 1].ids.length - 1];
const tokFirst = await deed.plotToToken(first);
const tokLast = await deed.plotToToken(last);
const checks = {
  'cosmo w banku == suma': vaultCosmo === cosmoAmount,
  'totalMinted == przed + 2000': totalMinted === mintedAfter,
  'pierwsza działka w banku': (await deed.ownerOf(tokFirst)) === vaultAddr,
  'ostatnia działka w banku': (await deed.ownerOf(tokLast)) === vaultAddr,
  'lock pierwszej == unlockTs': (await deed.lockedUntil(tokFirst)) === BigInt(unlockTs),
};
log.verify = Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v]));
log.finishedAt = new Date().toISOString();
fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
let bad = false;
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? '✅' : '❌'} ${k}`); if (!v) bad = true; }
console.log(`\nLog: ${logPath}\nExplorer: ${cfg.explorer}/address/${vaultAddr}`);
process.exit(bad ? 1 : 0);
