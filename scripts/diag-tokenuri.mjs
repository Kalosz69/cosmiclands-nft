// diag-tokenuri.mjs — READ-ONLY diagnostyka tokenURI na DeedV2 (Sepolia)
// Użycie: node scripts/diag-tokenuri.mjs <komercyjny_tokenId> <rezerwowy_tokenId>
import { JsonRpcProvider, Contract } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://base-sepolia.publicnode.com';
const DEED = '0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4';

const abi = [
  'function name() view returns (string)',
  'function baseURI() view returns (string)',
  'function totalMinted() view returns (uint256)',
  'function tokenURI(uint256) view returns (string)',
  'function tokenPlot(uint256) view returns (string)',
  'function ownerOf(uint256) view returns (address)',
  'function lockedUntil(uint256) view returns (uint256)',
];

const provider = new JsonRpcProvider(RPC);
const deed = new Contract(DEED, abi, provider);

const [name, baseURI, totalMinted] = await Promise.all([
  deed.name(), deed.baseURI(), deed.totalMinted()]);

console.log(`kontrakt : ${DEED}`);
console.log(`name     : ${name}`);
console.log(`baseURI  : "${baseURI}"`);
console.log(`totalMinted: ${totalMinted}`);

for (const arg of process.argv.slice(2)) {
  const id = BigInt(arg);
  try {
    const [uri, plot, owner, lock] = await Promise.all([
      deed.tokenURI(id), deed.tokenPlot(id), deed.ownerOf(id), deed.lockedUntil(id)]);
    const lockStr = lock > 0n ? new Date(Number(lock) * 1000).toISOString().slice(0, 10) : 'brak (transferowalny)';
    console.log(`\ntoken ${id}:\n  plot  : ${plot}\n  owner : ${owner}\n  lock  : ${lockStr}\n  URI   : ${uri}`);
  } catch (e) {
    console.log(`\ntoken ${id}: BŁĄD — ${e.message.split('\n')[0].slice(0, 120)}`);
  }
}
