#!/usr/bin/env node
/**
 * mint-test.mjs — test mintu deed na Base.
 * Użycie:
 *   NETWORK=base-sepolia PRIVATE_KEY=0x... DEED_ADDR=0x... BUYER=0x... node scripts/mint-test.mjs
 *   PLOT=MARS-PLOT-042001 TOKEN_URI=ipfs://Qm... node scripts/mint-test.mjs
 * Bez TOKEN_URI użyje baseURI z kontraktu + plotId + ".json".
 *
 * FIX 2026-09-13 (bug duplikatu tokenId — 23/45 certyfikatów z cudzym numerem):
 * tokenId czytany z MAPY KONTRAKTU (plotToToken), nie z globalnego licznika totalMinted().
 * Powód: totalMinted() odczytane zaraz po tx.wait() potrafi trafić na węzeł RPC o jedną
 * głowę w tyle → zwraca numer POPRZEDNIEGO mintu (wartość wiarygodna, ale cudza → cichy
 * błąd w evidence i na certyfikacie). plotToToken(plotId) jest przypisane do KONKRETNEJ
 * działki i nie może zwrócić cudzego tokenu; przy lagu zwraca 0 → twardy błąd, nie fałsz.
 * Sanity: tokenPlot(tokenId) === plotId (round-trip) — wykrywa każdą niespójność.
 * Ta sama semantyka co pre-check pollera (orchestrator/poller.mjs:190).
 */
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NETWORKS = {
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  'base':         { chainId: 8453,  rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
};
const network = process.env.NETWORK || 'base-sepolia';
const cfg = NETWORKS[network];
if (!cfg) throw new Error(`Nieznana sieć: ${network}`);
if (cfg.chainId !== 84532) throw new Error('CHAINID_GUARD: dozwolona WYŁĄCZNIE Base Sepolia (84532) — testy. Mainnet zablokowany.');

/**
 * Rozwiązuje tokenId dla działki ze stanu kontraktu (deterministycznie, odpornie na lag RPC).
 * @param {ethers.Contract} contract  kontrakt deed (read)
 * @param {string} plotId             np. MARS-PLOT-000001
 * @param {{receipt?:object, attempts?:number, delayMs?:number}} [opts]
 * @returns {Promise<bigint>} tokenId > 0, z potwierdzonym round-tripem tokenPlot(tokenId) === plotId
 */
export async function resolveTokenId(contract, plotId, opts = {}) {
  const { receipt = null, attempts = 6, delayMs = 1500 } = opts;
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    // 1. próba: stan dokładnie z bloku mintu (bez wyścigu z head-em); potem: latest.
    const blockTag = i === 0 && receipt ? receipt.blockNumber : undefined;
    let tid;
    try {
      tid = blockTag ? await contract.plotToToken(plotId, { blockTag }) : await contract.plotToToken(plotId);
    } catch (e) {
      lastErr = e;
      tid = 0n;
    }
    const n = BigInt(tid);
    if (n > 0n) {
      const back = await contract.tokenPlot(n).catch(() => null);
      if (back !== plotId) {
        throw new Error(`SANITY FAIL: tokenPlot(${n}) = ${back} ≠ ${plotId} — mapa kontraktu niespójna`);
      }
      return n;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`plotToToken(${plotId}) = 0 po ${attempts} próbach — mint niepotwierdzony on-chain${lastErr ? ` (${String(lastErr.message).slice(0, 60)})` : ''}`);
}

export async function main() {
  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const statePath = path.join(__dirname, '..', 'build', 'deployed-deed.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const deedAddr = process.env.DEED_ADDR || state.address;
  if (!deedAddr) throw new Error('Brak adresu deed (build/deployed-deed.json lub DEED_ADDR)');

  const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'CosmicLandsDeed.json'), 'utf8'));
  const deed = new ethers.Contract(deedAddr, artifact.abi, wallet);

  const plotId = process.env.PLOT || 'MARS-PLOT-000001';
  const buyer = process.env.BUYER || wallet.address;
  const tokenUri = process.env.TOKEN_URI || '';

  console.log(`[mint] ${network} deed=${deedAddr} plot=${plotId} -> ${buyer}`);
  const tx = await deed.mintDeed(buyer, plotId, tokenUri);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`MINT REVERTED: tx=${receipt.hash} status=${receipt.status}`);
  console.log(`✅ minted tokenId, tx=${receipt.hash}`);
  console.log(`   Explorer: ${cfg.explorer}/tx/${receipt.hash}`);

  // weryfikacja: tokenId z mapy działki (NIE z licznika) + ownerOf + tokenURI
  const tokenId = await resolveTokenId(deed, plotId, { receipt });
  const owner = await deed.ownerOf(tokenId);
  console.log(`   ownerOf(${tokenId}) = ${owner}`);
  if (owner.toLowerCase() !== buyer.toLowerCase()) {
    console.log(`   ⚠️  WARN: ownerOf ≠ BUYER (${buyer}) — sprawdź przed zapisem evidence`);
  }
  const total = await deed.totalMinted().catch(() => null);
  console.log(`   info: plotToToken = ${tokenId}, totalMinted() = ${total} (licznik globalny — NIE używany jako tokenId)`);
  try {
    const uri = await deed.tokenURI(tokenId);
    console.log(`   tokenURI = ${uri}`);
  } catch (e) {
    console.log('   (tokenURI: brak — baseURI pusty lub nieustawiony)');
  }
  return tokenId;
}

// Uruchamiaj tylko przy bezpośrednim wywołaniu (poller: node scripts/mint-test.mjs).
// Import z testów nie odpala mintu (top-level await po guardzie).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
