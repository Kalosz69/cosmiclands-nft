#!/usr/bin/env node
/**
 * deploy-with-seed.mjs — uruchamia skrypt projektu z PRIVATE_KEY wyprowadzonym z seed.
 *
 * Seed (12 słów) czyta z /opt/data/.secrets/trust walet.txt (linia bez "="),
 * klucz prywatny istnieje TYLKO w pamięci procesu — nigdy nie jest logowany ani zapisywany.
 *
 * Użycie:
 *   node scripts/deploy-with-seed.mjs --check
 *   node scripts/deploy-with-seed.mjs scripts/deploy-nft.mjs
 *   NETWORK=base-sepolia node scripts/deploy-with-seed.mjs scripts/mint-test.mjs
 */
import { Wallet } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const seedFile = process.env.SEED_FILE || '/opt/data/.secrets/trust walet.txt';
const raw = fs.readFileSync(seedFile, 'utf8');
const seedLine = raw
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.includes('='))
  .find((l) => l.split(/\s+/).length >= 12);

if (!seedLine) {
  console.error(`❌ Nie znaleziono seed (12 słów) w ${seedFile}`);
  process.exit(1);
}

const wallet = Wallet.fromPhrase(seedLine);
process.env.PRIVATE_KEY = wallet.privateKey; // tylko env procesu, nie logowane

const [, , firstArg, ...rest] = process.argv;

if (firstArg === '--check') {
  console.log(`✅ seed OK → adres: ${wallet.address}`);
  process.exit(0);
}

const script = firstArg;
if (!script) {
  console.error('Użycie: node scripts/deploy-with-seed.mjs <script.mjs> [args...] | --check');
  process.exit(1);
}

const scriptPath = path.resolve(__dirname, '..', script);
if (!fs.existsSync(scriptPath)) {
  console.error(`❌ Brak skryptu: ${scriptPath}`);
  process.exit(1);
}

console.log(`[wrapper] uruchamiam ${script} z portfela ${wallet.address}`);
await import(scriptPath);
