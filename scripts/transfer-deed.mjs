#!/usr/bin/env node
/**
 * transfer-deed.mjs — transfer istniejącego Deed z portfelu podpisującego (bank/treasury)
 * do adresu klienta. Używany przez pollera (v1.4) gdy plot już zmintowany na banku,
 * a zamówienie wskazuje portfel klienta (DIRECT).
 * Użycie:
 *   NETWORK=base-sepolia PRIVATE_KEY=0x... PLOT=MARS-PLOT-000001 TO=0x... node scripts/transfer-deed.mjs
 * Drukuje: tx=0x... tokenId=N owner=0x...
 * GUARD: wyłącznie Base Sepolia (84532). Wymaga, aby signer był właścicielem tokenu.
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

const PLOT = process.env.PLOT;
const TO = process.env.TO;
if (!PLOT || !TO || !/^0x[a-fA-F0-9]{40}$/.test(TO)) throw new Error('PLOT i TO (0x…) wymagane');

const provider = new ethers.JsonRpcProvider(cfg.rpc);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const state = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'deployed-deed.json'), 'utf8'));
const deedAddr = process.env.DEED_ADDR || state.address;
const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'CosmicLandsDeed.json'), 'utf8'));
const deed = new ethers.Contract(deedAddr, artifact.abi, wallet);

const tokenId = await deed.plotToToken(PLOT);
if (tokenId === 0n) throw new Error(`Plot ${PLOT} nie istnieje on-chain`);
const owner = (await deed.ownerOf(tokenId)).toLowerCase();
if (owner !== wallet.address.toLowerCase()) {
  throw new Error(`Signer ${wallet.address} NIE jest ownerem tokenu ${tokenId} (owner=${owner}) — transfer niemożliwy z tego klucza`);
}

console.log(`[transfer] ${network} deed=${deedAddr} plot=${PLOT} tokenId=${tokenId} ${owner} -> ${TO}`);
const tx = await deed.transferFrom(wallet.address, TO, tokenId);
const receipt = await tx.wait();
console.log(`tx=${receipt.hash}`);
console.log(`tokenId=${tokenId.toString()}`);
const newOwner = (await deed.ownerOf(tokenId)).toLowerCase();
console.log(`owner=${newOwner}`);
if (newOwner !== TO.toLowerCase()) throw new Error('Weryfikacja ownerOf po transferze FAILED');
console.log(`✅ transferred ${PLOT} (${tokenId}) → ${TO}`);
