#!/usr/bin/env node
/**
 * test-lock-runtime.mjs — RUNTIME test locka rezerwatu (CosmicLandsDeedV2)
 * i banku (CosmoBankVault) na lokalnym EVM.
 *
 * Wymaga działającego: npx hardhat node --port 18546 (EDR, Cancun)
 * Używa artefaktów produkcyjnych z build/ (bez PUSH0 problemu — EDR wspiera Cancun).
 *
 * T9a  mint rezerwatu z unlockAt w przyszłości — transfer PRZED czasem REVERT
 * T9b  po czasie (evm_increaseTime) — transfer OK
 * T9c  setUnlockAt nie może SKRÓCIĆ locka (tylko wydłużyć)
 * T10a vault: withdraw przed unlockTime REVERT (COSMO + NFT)
 * T10b vault: po czasie withdraw OK
 * T10c deed komercyjny (bez locka) — transfer od razu OK
 */
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
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
const load = name => JSON.parse(fs.readFileSync(path.join(root, 'build', name + '.json'), 'utf8'));

const now = Math.floor(Date.now() / 1000);
const UNLOCK = now + 7200; // za 2h (test); produkcja: 10–50 lat

// ---- deploy ----
const cosmoArt = load('CosmoToken');
const cosmo = await new ethers.ContractFactory(cosmoArt.abi, cosmoArt.bytecode, owner)
  .deploy(ethers.parseEther('57999000')); // 57 999 000 + 1000 do mintu w teście = pełne 58M
await cosmo.waitForDeployment();
console.log('✅ CosmoToken deploy:', await cosmo.getAddress());

const deedArt = load('CosmicLandsDeedV2');
const deed = await new ethers.ContractFactory(deedArt.abi, deedArt.bytecode, owner)
  .deploy('ipfs://base/', 10000);
await deed.waitForDeployment();
console.log('✅ CosmicLandsDeedV2 deploy:', await deed.getAddress());

const vaultArt = load('CosmoBankVault');
const vault = await new ethers.ContractFactory(vaultArt.abi, vaultArt.bytecode, owner)
  .deploy(await cosmo.getAddress(), await deed.getAddress(), UNLOCK);
await vault.waitForDeployment();
console.log('✅ CosmoBankVault deploy:', await vault.getAddress());

// ---- T9a: mint rezerwatu, transfer przed czasem REVERT ----
await (await deed.mintReserveDeed(buyer.address, 'MARS-RES-000001', 'ipfs://res/1', UNLOCK)).wait();
const lu = await deed.lockedUntil(1);
check('T9a lock ustawiony', lu === BigInt(UNLOCK), `lockedUntil=${lu}`);
let reverted = false;
try {
  await (await deed.connect(buyer).transferFrom(buyer.address, owner.address, 1)).wait();
} catch (e) { reverted = /deed locked/.test(e.message || ''); }
check('T9a transfer przed unlock REVERT', reverted);

// ---- T9c: nie można skrócić locka ----
reverted = false;
try {
  await (await deed.setUnlockAt(1, UNLOCK - 100)).wait();
} catch (e) { reverted = /only extend lock/.test(e.message || ''); }
check('T9c setUnlockAt skrócenie REVERT', reverted);
await (await deed.setUnlockAt(1, UNLOCK + 100)).wait();
check('T9c setUnlockAt wydłużenie OK', (await deed.lockedUntil(1)) === BigInt(UNLOCK + 100));
reverted = false;
try {
  await (await deed.setUnlockAt(1, UNLOCK + 50)).wait(); // skrócenie względem +100
} catch (e) { reverted = /only extend lock/.test(e.message || ''); }
check('T9c drugie skrócenie REVERT', reverted);

// ---- T10c: deed komercyjny — transfer od razu OK ----
await (await deed.mintDeed(buyer.address, 'MARS-PLOT-000001', 'ipfs://com/1')).wait();
await (await deed.connect(buyer).transferFrom(buyer.address, owner.address, 2)).wait();
check('T10c komercyjny transfer od razu OK', (await deed.ownerOf(2)) === owner.address);

// ---- T10a: vault — deposit COSMO OK, withdraw przed czasem REVERT ----
await (await cosmo.mint(buyer.address, ethers.parseEther('1000'))).wait();
await (await cosmo.connect(buyer).approve(await vault.getAddress(), ethers.parseEther('1000'))).wait();
await (await vault.connect(buyer).depositCosmo(ethers.parseEther('1000'))).wait();
check('T10a depositCosmo OK', (await vault.cosmoBalance()) === ethers.parseEther('1000'));
reverted = false;
try {
  await (await vault.withdrawCosmo(owner.address, ethers.parseEther('10'))).wait();
} catch (e) { reverted = /vault locked/.test(e.message || ''); }
check('T10a withdrawCosmo przed czasem REVERT', reverted);

// ---- T10a: zablokowany deed nie wejdzie do vaulta ----
reverted = false;
try {
  await (await deed.connect(buyer).approve(await vault.getAddress(), 1)).wait();
  await (await vault.connect(buyer).depositDeed(1)).wait();
} catch (e) { reverted = /deed locked/.test(e.message || ''); }
check('T10a depositDeed zablokowany REVERT', reverted);
reverted = false;
try {
  await (await vault.withdrawDeed(owner.address, 1)).wait();
} catch (e) { reverted = /vault locked/.test(e.message || ''); }
check('T10a withdrawDeed przed czasem REVERT', reverted);

// ---- przeskocz czas: +7400s (poza unlock = UNLOCK+100) ----
await eth.send('evm_increaseTime', [7400]);
await eth.send('evm_mine', []);

// ---- T9b: transfer rezerwatu PO czasie OK ----
await (await deed.connect(buyer).transferFrom(buyer.address, owner.address, 1)).wait();
check('T9b transfer rezerwatu po unlock OK', (await deed.ownerOf(1)) === owner.address);

// ---- T10b: vault po czasie — withdraw OK ----
await (await vault.withdrawCosmo(owner.address, ethers.parseEther('1000'))).wait();
check('T10b withdrawCosmo po czasie OK', (await vault.cosmoBalance()) === 0n);
await (await deed.connect(owner).approve(await vault.getAddress(), 1)).wait();
await (await vault.depositDeed(1)).wait();
await (await vault.withdrawDeed(owner.address, 1)).wait();
check('T10b withdrawDeed po czasie OK', (await deed.ownerOf(1)) === owner.address);

console.log(failed ? `\n❌ ${failed} niepowodzeń` : '\n✅ Runtime lock test — wszystkie PASS');
process.exit(failed ? 1 : 0);
