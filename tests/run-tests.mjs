#!/usr/bin/env node
/**
 * run-tests.mjs — lokalne testy symulacyjne (bez kluczy zewnętrznych).
 * Uruchamia: (1) HMAC webhook, (2) PDF certyfikatu, (3) obecność artefaktów kompilacji,
 * (4) sanity ABI/bytecode, (5) poprawność build/deployed JSON (jeśli istnieją).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
let failed = 0;
const run = (label, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 120000 });
  console.log(`\n── ${label} ──`);
  if (r.status !== 0) {
    console.log(`❌ ${label} — exit ${r.status}\n${(r.stdout || '') + (r.stderr || '')}`);
    failed++;
  } else {
    console.log(`${r.stdout?.split('\n').filter(Boolean).slice(-4).join('\n')}`);
    console.log(`✅ ${label} — PASS`);
  }
};

run('Webhook HMAC', process.execPath, ['tests/test-webhook-hmac.mjs']);
run('PDF certyfikatu', process.execPath, ['scripts/generate-certificate.mjs', '--plot', 'MARS-PLOT-000042']);

// artefakty kompilacji
console.log('\n── Artefakty kompilacji ──');
for (const name of ['CosmicLandsDeed.json', 'CosmicLandsDeedV2.json', 'CosmoToken.json', 'CosmoBankVault.json']) {
  const p = path.join(root, 'build', name);
  const ok = fs.existsSync(p);
  if (!ok) { console.log(`❌ brak build/${name}`); failed++; continue; }
  const a = JSON.parse(fs.readFileSync(p, 'utf8'));
  const abiOk = Array.isArray(a.abi) && a.abi.length > 0;
  const codeOk = typeof a.bytecode === 'string' && a.bytecode.length > 100;
  if (!abiOk || !codeOk) { console.log(`❌ build/${name} — ABI/bytecode niepełne`); failed++; }
  else console.log(`✅ build/${name} — ABI ${a.abi.length} wpisów, bytecode ${a.bytecode.length / 2} B`);
}

// sanity: sprawdzenie sygnatur kluczowych funkcji
const deed = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmicLandsDeed.json'), 'utf8'));
const fn = deed.abi.filter(x => x.type === 'function').map(x => x.name);
for (const need of ['mintDeed', 'burnDeed', 'setBaseURI', 'exists', 'ownerOf', 'tokenURI']) {
  if (!fn.includes(need)) { console.log(`❌ brak funkcji ${need}`); failed++; }
  else console.log(`✅ funkcja ${need} — OK`);
}
const cosmo = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmoToken.json'), 'utf8'));
const cf = cosmo.abi.filter(x => x.type === 'function').map(x => x.name);
for (const need of ['mint', 'transfer', 'balanceOf', 'totalSupply']) {
  if (!cf.includes(need)) console.log(`⚠️ brak funkcji ${need} (sprawdź CosmoToken)`);
}

// sanity V2: lock rezerwatu
const deedV2 = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmicLandsDeedV2.json'), 'utf8'));
const fn2 = deedV2.abi.filter(x => x.type === 'function').map(x => x.name);
for (const need of ['mintDeed', 'mintReserveDeed', 'setUnlockAt', 'lockedUntil', 'burnDeed', 'setBaseURI']) {
  if (!fn2.includes(need)) { console.log(`❌ V2 brak funkcji ${need}`); failed++; }
  else console.log(`✅ V2 funkcja ${need} — OK`);
}

// sanity Vault: bank z timelockiem
const vault = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmoBankVault.json'), 'utf8'));
const vf = vault.abi.filter(x => x.type === 'function').map(x => x.name);
for (const need of ['depositCosmo', 'depositDeed', 'withdrawCosmo', 'withdrawDeed', 'unlockTime', 'lockedFor']) {
  if (!vf.includes(need)) { console.log(`❌ Vault brak funkcji ${need}`); failed++; }
  else console.log(`✅ Vault funkcja ${need} — OK`);
}

// PDF istnieje
const pdf = path.join(root, 'test-output', 'MARS-PLOT-000042.pdf');
if (fs.existsSync(pdf) && fs.statSync(pdf).size > 1000) console.log(`✅ PDF na dysku (${fs.statSync(pdf).size} B)`);
else { console.log(`❌ PDF nie wygenerowany`); failed++; }

// deploy state — opcjonalny
if (fs.existsSync(path.join(root, 'build', 'deployed-deed.json'))) {
  console.log('ℹ️  deployed-deed.json obecny — deploy już wykonany wcześniej');
}

console.log(failed ? `\n❌${failed} niepowodzeń` : '\n✅ Wszystkie testy lokalne PASS');
process.exit(failed ? 1 : 0);