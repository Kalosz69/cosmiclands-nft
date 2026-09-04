#!/usr/bin/env node
/**
 * deploy-vault.mjs — wdrożenie CosmoBankVault (bank rezerwatu).
 * Usage: NETWORK=base-sepolia node scripts/deploy-vault.mjs
 * Klucz prywatny: czytany z /opt/data/.secrets/trust walet.txt (mnemonic → HDNodeWallet),
 * nigdy nie przekazywany przez argv/env ani nie drukowany.
 *
 * Adresy kontraktów: brać z build/deployed-{cosmo,deed}.json (zero ręcznego wpisywania),
 * chyba że COSMO_ADDRESS / DEED_ADDRESS w env nadpisują (do testów lokalnych).
 * UNLOCK_TS: timestamp 1.01.2036 UTC = 2082758400 (okno Marsa, D2 = 10 lat) —
 * do zatwierdzenia przez Kapitana; override tylko przez UNLOCK_TS env.
 */
import { ethers, HDNodeWallet } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const NETWORKS = {
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  'base': { chainId: 8453, rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
};
const network = process.env.NETWORK || 'base-sepolia';
const cfg = NETWORKS[network];
if (cfg.chainId !== 84532) throw new Error('CHAINID_GUARD: dozwolona WYŁĄCZNIE Base Sepolia (84532) — testy. Mainnet zablokowany.');
if (!cfg) throw new Error(`Nieznana sieć: ${network}`);

// --- klucz z sekretów (ścieżka znana, wartości nie wychodzą na wyjście) ---
const SEC_PATH = '/opt/data/.secrets/trust walet.txt';
function loadMnemonic() {
  const raw = fs.readFileSync('/opt/data/.secrets/trust walet.txt', 'utf8');
  const lines = raw.split(/\r?\n/);
  const i = lines.findIndex(l => /^secret:/i.test(l.trim()));
  if (i < 0) throw new Error('Brak sekcji secret w pliku sekretów');
  // fraza może być po dwukropku lub w następnej niepustej linii
  const inline = lines[i].replace(/^secret:\s*/i, '').trim();
  const phrase = inline || lines.slice(i + 1).find(l => l.trim())?.trim();
  if (!phrase || phrase.split(/\s+/).length !== 12) throw new Error('Nieprawidłowa fraza seed (oczekiwano 12 słów)');
  return phrase;
}
function loadWallet(provider) {
  // NonceManager: chroni przed kolizją nonce przy szybkich sekwencyjnych tx
  return new ethers.NonceManager(HDNodeWallet.fromPhrase(loadMnemonic())).connect(provider);
}

// --- adresy z deployed-*.json (source of truth) ---
function deployed(name) {
  const f = path.join(root, 'build', `deployed-${name}.json`);
  if (!fs.existsSync(f)) throw new Error(`Brak ${f} — najpierw deploy ${name}`);
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.network !== network) throw new Error(`${name}: deployed na '${j.network}', próbujesz na '${network}'`);
  return j.address;
}
const cosmoAddr = ethers.getAddress(process.env.COSMO_ADDRESS || deployed('cosmo'));
const deedAddr = ethers.getAddress(process.env.DEED_ADDRESS || deployed('deed'));

// --- unlock: 1.01.2036 UTC = okno Marsa (D2: 10 lat; generator: GENESIS_UNLOCK 2036) ---
const UNLOCK_MARS_2036 = 2082758400;
const unlockTs = Number(process.env.UNLOCK_TS || UNLOCK_MARS_2036);
if (!Number.isInteger(unlockTs) || unlockTs <= Math.floor(Date.now() / 1000)) {
  throw new Error(`UNLOCK_TS musi być przyszłym integerem (sekundy): ${unlockTs}`);
}
console.log(`UNLOCK: ${unlockTs} (= ${new Date(unlockTs * 1000).toISOString().slice(0, 10)} UTC)`);

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || cfg.rpc);
const wallet = loadWallet(provider);
const deployer = await wallet.getAddress();
console.log(`Deployer: ${deployer} | sieć: ${network} (${cfg.chainId})`);

const art = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmoBankVault.json'), 'utf8'));
const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
const vault = await factory.deploy(cosmoAddr, deedAddr, unlockTs);
await vault.waitForDeployment();
const addr = await vault.getAddress();

const rc = await provider.getTransactionReceipt((await vault.deploymentTransaction()).hash);
if (rc.status !== 1) throw new Error('Deploy REVERT');
console.log(`✅ CosmoBankVault: ${addr}`);
console.log(`   Explorer: ${cfg.explorer}/address/${addr}`);

const out = {
  network,
  chainId: cfg.chainId,
  address: addr,
  cosmo: cosmoAddr,
  deed: deedAddr,
  unlockTimestamp: unlockTs,
  unlockUTC: new Date(unlockTs * 1000).toISOString(),
  txHash: rc.hash,
  deployedAt: new Date().toISOString(),
};
// nie nadpisuj istniejącego deployu bez wyraźnej zgody; OUT = override ścieżki (do prób lokalnych)
const dest = process.env.OUT || path.join(root, 'build', 'deployed-vault.json');
if (fs.existsSync(dest)) {
  const bak = dest.replace('.json', `-prev-${Date.now()}.json`);
  fs.copyFileSync(dest, bak);
  console.log(`   Backup poprzedniego: ${bak}`);
}
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`   Zapisano ${dest}`);
