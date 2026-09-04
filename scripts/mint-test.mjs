#!/usr/bin/env node
/**
 * mint-test.mjs — test mintu deed na Base.
 * Użycie:
 *   NETWORK=base-sepolia PRIVATE_KEY=0x... DEED_ADDR=0x... BUYER=0x... node scripts/mint-test.mjs
 *   PLOT=MARS-PLOT-042001 TOKEN_URI=ipfs://Qm... node scripts/mint-test.mjs
 * Bez TOKEN_URI użyje baseURI z kontraktu + plotId + ".json".
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
if (cfg.chainId !== 84532) throw new Error('CHAINID_GUARD: dozwolona WYŁĄCZNIE Base Sepolia (84532) — testy. Mainnet zablokowany.');
if (!cfg) throw new Error(`Nieznana sieć: ${network}`);

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
console.log(`✅ minted tokenId, tx=${receipt.hash}`);
console.log(`   Explorer: ${cfg.explorer}/tx/${receipt.hash}`);

// weryfikacja: ownerOf + tokenURI
const { toNumber } = ethers;
const tokenId = toNumber ? await deed.totalMinted() : null;
const owner = await deed.ownerOf(tokenId ?? 1);
console.log(`   ownerOf(${tokenId}) = ${owner}`);
try {
  const uri = await deed.tokenURI(tokenId ?? 1);
  console.log(`   tokenURI = ${uri}`);
} catch (e) {
  console.log('   (tokenURI: brak — baseURI pusty lub nieustawiony)');
}