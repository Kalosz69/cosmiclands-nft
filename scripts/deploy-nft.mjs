#!/usr/bin/env node
/**
 * deploy-nft.mjs — wdrożenie kontraktu CosmicLandsDeed na Base (L2)
 *
 * Użycie:
 *   NETWORK=base-sepolia PRIVATE_KEY=0x... node scripts/deploy-nft.mjs
 *   NETWORK=base        PRIVATE_KEY=0x... node scripts/deploy-nft.mjs
 *
 * Sekrety wyłącznie z env (nigdy w repo/one-linerach).
 */
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NETWORKS = {
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  'base':         { chainId: 8453,  rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
};

const network = process.env.NETWORK || 'base-sepolia';
const cfg = NETWORKS[network];
if (!cfg) throw new Error(`Nieznana sieć: ${network} (dostępne: ${Object.keys(NETWORKS).join(', ')})`);
if (!process.env.PRIVATE_KEY) throw new Error('Brak PRIVATE_KEY w env');

const provider = new ethers.JsonRpcProvider(cfg.rpc);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/CosmicLandsDeed.json'), 'utf8'));

// Parametry: baseURI (przyszłe miejsce metadata) + maxSupply (10 000)
const baseURI = process.env.NFT_BASE_URI || 'ipfs://';
const maxSupply = parseInt(process.env.NFT_MAX_SUPPLY || '10000', 10);

const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
console.log(`[deploy] ${network} (chainId ${cfg.chainId}) z ${wallet.address}`);
console.log(`[deploy] baseURI=${baseURI} maxSupply=${maxSupply}`);

const contract = await factory.deploy(baseURI, maxSupply);
await contract.waitForDeployment();
const addr = await contract.getAddress();
console.log(`✅ DEED contract: ${addr}`);
console.log(`   Explorer: ${cfg.explorer}/address/${addr}`);

// zapisz adres do pliku stanu (do użycia w mint/metadata)
fs.writeFileSync(path.join(__dirname, '..', 'build', 'deployed-deed.json'), JSON.stringify({
  network, chainId: cfg.chainId, address: addr, baseURI, maxSupply, deployedAt: new Date().toISOString(),
}, null, 2));
console.log('   Zapisano build/deployed-deed.json');