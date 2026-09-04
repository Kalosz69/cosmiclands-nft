// diag-batch-gas.mjs — READ-ONLY pomiar kosztów mintów z łańcucha (Base Sepolia)
import { JsonRpcProvider, Contract } from 'ethers';
import { readFileSync, readdirSync } from 'fs';

const p = new JsonRpcProvider('https://base-sepolia.publicnode.com');
const DEED = '0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4';
const fmt = (wei) => Number(wei) / 1e18;

// --- 1. wszystkie tx na kontrakcie Deed w okolicy Etapu B (logi -> tx -> receipt) ---
const logs = await p.send('eth_getLogs', [{
  address: DEED,
  fromBlock: '0x' + (46043000).toString(16),
  toBlock: '0x' + (46043500).toString(16),
}]);
const txHashes = [...new Set(logs.map(l => l.transactionHash))];
const batches = [];
for (const h of txHashes) {
  const r = await p.getTransactionReceipt(h);
  const fee = BigInt(r.gasUsed) * BigInt(r.gasPrice ?? 0);
  batches.push({ hash: h.slice(0, 16) + '…', gasUsed: Number(r.gasUsed), feeETH: fmt(fee), logs: r.logs.length });
}
batches.sort((a, b) => b.gasUsed - a.gasUsed);
console.log(`TX na Deed w blokach 46043000–46043500: ${batches.length}`);
console.log('TOP 5 po gasUsed (kandydaci na batch 100 szt.):');
for (const b of batches.slice(0, 5)) console.log(' ', JSON.stringify(b));

// --- 2. pojedyncze minty komercyjne z evidence ---
console.log('\nPojedyncze minty (orchestrator, order 22a):');
const evDir = 'orchestrator/evidence';
const singles = [];
for (const d of readdirSync(evDir)) {
  try {
    const txh = readFileSync(`${evDir}/${d}/mint_tx.txt`, 'utf8').trim();
    if (!/^0x[0-9a-f]{64}$/.test(txh)) continue;
    const r = await p.getTransactionReceipt(txh);
    if (r) singles.push({ order: d, gasUsed: Number(r.gasUsed), feeETH: fmt(BigInt(r.gasUsed) * BigInt(r.gasPrice ?? 0)) });
  } catch { /* brak pliku — pomiń */ }
}
for (const s of singles) console.log(' ', JSON.stringify(s));
const avgSingle = singles.length ? singles.reduce((a, s) => a + s.gasUsed, 0) / singles.length : 0;
console.log(`średni gasUsed pojedynczego mintu: ${Math.round(avgSingle)}`);

// --- 3. gas price teraz (Sepolia i Mainnet) ---
const [fs, fm] = await Promise.all([p.getFeeData(), new JsonRpcProvider('https://mainnet.base.org').getFeeData()]);
console.log(`\ngasPrice teraz: Sepolia=${Number(fs.gasPrice) / 1e9} gwei | Mainnet=${Number(fm.gasPrice) / 1e9} gwei`);
console.log(`mainnet maxFeePerGas estymata: ${fm.maxFeePerGas ? Number(fm.maxFeePerGas) / 1e9 : '?'} gwei`);
