#!/usr/bin/env node
/**
 * bridge-sepolia-to-base.mjs — przenosi ETH z Ethereum Sepolia na Base Sepolia
 * przez OptimismPortal.depositTransaction (oficjalny wzorzec programmatic bridge,
 * wg base-org/guides/bridge/native). Seed z .secrets, bez przeglądarki.
 *
 * Użycie: node scripts/bridge-sepolia-to-base.mjs [kwota_ETH] [adres_na_L2]
 */
import { Wallet, JsonRpcProvider, parseEther, formatEther, Contract, Interface } from 'ethers';
import fs from 'node:fs';

// adresy zweryfikowane w docs.base.org/base-chain/network-information/base-contracts
// Ethereum Testnet (Sepolia): OptimismPortal
const PORTAL = '0x49f53e41452C74589E85cA1677426Ba426459e85';
const L1_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const L2_RPC = 'https://sepolia.base.org';

const PORTAL_ABI = [
  'function depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data) payable',
];

const amount = parseEther(process.argv[2] || '0.2');

const seedFile = '/opt/data/.secrets/trust walet.txt';
const raw = fs.readFileSync(seedFile, 'utf8');
const seedLine = raw
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.includes('='))
  .find((l) => l.split(/\s+/).length >= 12);
if (!seedLine) { console.error('Brak seed'); process.exit(1); }

const provider = new JsonRpcProvider(L1_RPC);
const wallet = new Wallet(Wallet.fromPhrase(seedLine).privateKey, provider);
const l2Target = process.argv[3] || wallet.address; // na L2 środki idą na ten sam adres (EOA deterministyczny)

console.log(`[bridge] z ${wallet.address} -> Base Sepolia (L2: ${l2Target}), kwota ${formatEther(amount)} ETH`);

const bal = await wallet.provider.getBalance(wallet.address);
console.log(`[bridge] balans L1 przed: ${formatEther(bal)} ETH`);
if (bal < amount + parseEther('0.005')) {
  console.error('❌ za mało ETH na L1 (potrzebne + gaz)');
  process.exit(1);
}

const portal = new Contract(PORTAL, PORTAL_ABI, wallet);
const iface = new Interface(PORTAL_ABI);

// depositTransaction(to=L2 target, value=amount, gasLimit=100000, isCreation=false, data=0x)
const data = iface.encodeFunctionData('depositTransaction', [l2Target, amount, 100000n, false, '0x']);
const gas = await wallet.estimateGas({ to: PORTAL, value: amount, data });
console.log(`[bridge] szacowany gaz: ${gas.toString()}`);

const tx = await wallet.sendTransaction({ to: PORTAL, value: amount, data });
console.log(`[bridge] tx wysłana: ${tx.hash}`);
console.log(`   Ethereum Sepolia explorer: https://sepolia.etherscan.io/tx/${tx.hash}`);

const receipt = await tx.wait();
console.log(`[bridge] potwierdzona w bloku ${receipt.blockNumber}, status=${receipt.status}`);
console.log(`   Base Sepolia: środki pojawią się po finalizacji mostu (zwykle ~2-10 min)`);
