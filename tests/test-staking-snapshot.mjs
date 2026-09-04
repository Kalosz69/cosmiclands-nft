#!/usr/bin/env node
/**
 * test-staking-snapshot.mjs — E2E test codziennego snapshotu stakingu (22:00).
 * Wymaga: npx hardhat node --port 18546 (w tle).
 *
 * Scenariusz:
 *  1. deploy CosmicLandsDeedV2, mint komercyjny do kupca
 *  2. data/holders.json: kupiec trzyma token 1 od 2026-08-01
 *  3. staking-snapshot --demo → "TRZYMA" (holding)
 *  4. kupiec sprzedaje/transferuje NFT → snapshot → "PRZENIESIONY"
 *  5. przywrócenie data/holders.json
 */
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
};

const eth = new ethers.JsonRpcProvider('http://127.0.0.1:18546');
const [owner, buyer] = await Promise.all([eth.getSigner(0), eth.getSigner(1)]);
const deedArt = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmicLandsDeedV2.json'), 'utf8'));
const deed = await new ethers.ContractFactory(deedArt.abi, deedArt.bytecode, owner).deploy('ipfs://base/', 10000);
await deed.waitForDeployment();
const deedAddr = await deed.getAddress();

await (await deed.mintDeed(buyer.address, 'MARS-PLOT-000001', 'ipfs://com/1')).wait();

const holdersFile = path.join(root, 'data', 'holders.json');
const orig = fs.existsSync(holdersFile) ? fs.readFileSync(holdersFile, 'utf8') : null;
fs.mkdirSync(path.dirname(holdersFile), { recursive: true });
fs.writeFileSync(holdersFile, JSON.stringify([
  { address: buyer.address, tokenId: 1, since: '2026-08-01', plotId: 'MARS-PLOT-000001' },
], null, 2));

const runSnapshot = () => spawnSync(process.execPath, ['scripts/staking-snapshot.mjs', '--demo'], {
  cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, DEED_ADDRESS: deedAddr },
});

// 1. klient trzyma → TRZYMA
let r = runSnapshot();
check('S1 snapshot: klient TRZYMA', /TRZYMA/.test(r.stdout), r.stdout.split('\n').filter(l => l.includes('MARS')).join('') || r.stdout.slice(-80));

// 2. sprzedaż — NFT przechodzi dalej
await (await deed.connect(buyer).transferFrom(buyer.address, owner.address, 1)).wait();
r = runSnapshot();
check('S2 snapshot: PRZENIESIONY po transferze', /PRZENIESIONY/.test(r.stdout), r.stdout.split('\n').filter(l => l.includes('MARS')).join('') || r.stdout.slice(-80));

// 3. przywróć holders.json
if (orig) fs.writeFileSync(holdersFile, orig);
else fs.rmSync(holdersFile, { force: true });

console.log(failed ? `\n❌ ${failed} niepowodzeń` : '\n✅ Staking snapshot E2E — PASS');
process.exit(failed ? 1 : 0);
