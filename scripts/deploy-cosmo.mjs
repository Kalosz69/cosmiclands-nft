#!/usr/bin/env node
/**
 * deploy-cosmo.mjs — wdrożenie tokenu COSMO (ERC-20) na Base.
 * Użycie: NETWORK=base-sepolia PRIVATE_KEY=0x... node scripts/deploy-cosmo.mjs
 */
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NETWORKS = {
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  'base':         { chainId: 8453,  rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
};
const network = process.env.NETWORK || 'base-sepolia';
const cfg = NETWORKS[network];
if (!cfg) throw new Error(`Nieznana sieć: ${network}`);
if (!process.env.PRIVATE_KEY) throw new Error('Brak PRIVATE_KEY');

const provider = new ethers.JsonRpcProvider(cfg.rpc);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'CosmoToken.json'), 'utf8'));

// Initial supply = 58 000 000 COSMO (sztywna emisja, tokenomika v2 — K 18.08). MAX_SUPPLY w kontrakcie = 58M.
const totalSupply = process.env.COSMO_SUPPLY || '58000000';
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy(ethers.parseEther(totalSupply));
await contract.waitForDeployment();
const addr = await contract.getAddress();
console.log(`✅ COSMO contract: ${addr}`);
console.log(`   Explorer: ${cfg.explorer}/address/${addr}`);
fs.writeFileSync(path.join(__dirname, '..', 'build', 'deployed-cosmo.json'), JSON.stringify({
  network, chainId: cfg.chainId, address: addr, supply: totalSupply, deployedAt: new Date().toISOString(),
}, null, 2));
console.log('   Zapisano build/deployed-cosmo.json');