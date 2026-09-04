#!/usr/bin/env node
/**
 * staking-snapshot.mjs — COZIENNY SNAPSHOT STAKINGU (model holding-based, K 19.08).
 *
 * Zasada: staking liczy się OD DNIA ZAKUPU i trwa, dopóki klient TRZYMA deed
 * we WŁASNYM portfelu (my nie przechowujemy NFT klientów — bezpieczniej u nich).
 * Co dzień o 22:00 weryfikujemy na łańcuchu, że NFT nadal jest na adresie klienta.
 *
 * Wejście:  data/holders.json — [{"address","tokenId","since":"YYYY-MM-DD","plotId"}]
 *           (zakupy z Shopify + adres klienta; uzupełniane przy sprzedaży)
 * Wyjście:  data/staking-snapshot-YYYY-MM-DD.json + podsumowanie do logu
 * RPC:      NETWORK=base|base-sepolia (default base-sepolia); tryb demo: --demo (hardhat node :18546)
 *
 * Użycie:   node scripts/staking-snapshot.mjs            # realny RPC
 *           node scripts/staking-snapshot.mjs --demo     # lokalny hardhat node
 * Cron:     0 22 * * *  (po deployu produkcji — patrz 13-PROJEKT-WDROZENIOWY F5)
 */
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const NETWORKS = {
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org' },
  'base':         { chainId: 8453,  rpc: 'https://mainnet.base.org' },
};

const holdersFile = path.join(root, 'data', 'holders.json');
if (!fs.existsSync(holdersFile)) {
  console.log('Brak data/holders.json — tworzę szablon. Uzupełnij po pierwszej sprzedaży.');
  fs.mkdirSync(path.dirname(holdersFile), { recursive: true });
  fs.writeFileSync(holdersFile, JSON.stringify([], null, 2));
}
const holders = JSON.parse(fs.readFileSync(holdersFile, 'utf8'));
if (!holders.length) {
  console.log('data/holders.json jest pusty — snapshot niepotrzebny (0 klientów).');
  process.exit(0);
}

const demo = process.argv.includes('--demo');
const provider = demo
  ? new ethers.JsonRpcProvider('http://127.0.0.1:18546')
  : new ethers.JsonRpcProvider(NETWORKS[process.env.NETWORK || 'base-sepolia'].rpc);

const deedAddress = process.env.DEED_ADDRESS;
if (!deedAddress) {
  console.error('Brak DEED_ADDRESS (adres kontraktu CosmicLandsDeedV2).');
  process.exit(1);
}

// Minimalny ABI — tylko ownerOf
const abi = ['function ownerOf(uint256 tokenId) external view returns (address)'];
const deed = new ethers.Contract(deedAddress || ethers.ZeroAddress, abi, provider);

const today = new Date().toISOString().slice(0, 10);
const results = [];
let holding = 0, moved = 0;

for (const h of holders) {
  try {
    const owner = await deed.ownerOf(h.tokenId);
    const ok = owner.toLowerCase() === h.address.toLowerCase();
    const sinceMs = Date.parse(h.since);
    const days = sinceMs ? Math.max(0, Math.floor((Date.now() - sinceMs) / 86400000)) : 0;
    results.push({ ...h, holding: ok, owner, days });
    ok ? holding++ : moved++;
    console.log(`${ok ? '✅' : '⚠️'} ${h.plotId || h.tokenId} → ${ok ? 'TRZYMA' : 'PRZENIESIONY'} (${days} dni)`);
  } catch (e) {
    results.push({ ...h, holding: false, owner: null, error: e.message.slice(0, 120) });
    moved++;
    console.log(`❌ ${h.plotId || h.tokenId} — błąd: ${e.message.slice(0, 80)}`);
  }
}

const out = path.join(root, 'data', `staking-snapshot-${today}.json`);
fs.writeFileSync(out, JSON.stringify({ date: today, total: holders.length, holding, moved, results }, null, 2));
console.log(`\nSnapshot: ${holding}/${holders.length} trzyma, ${moved} nie. Zapisano: ${out}`);
