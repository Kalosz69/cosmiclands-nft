#!/usr/bin/env node
/**
 * mint-reserve-schedule.mjs — harmonogram MINTÓW REZERWATU (terminowo) + blokad do
 * odblokowania planet (10/15/20/25/30/35/40/50 lat).
 *
 * Model (tokenomika v2, K 18.08):
 *  - 8 planet × 2 000 działek rezerwatu = 16 000 działek = 9 280 000 COSMO (pełne pakiety)
 *  - działki rezerwatu mintowane TERMINOWO wg harmonogramu (skrypt/cron),
 *    transfer zablokowany do daty odblokowania planety (CosmicLandsDeedV2.unlockAt)
 *  - pule COSMO trafiają do CosmoBankVault (lock >= 10 lat) — nie do obrotu przed czasem
 *
 * Użycie:
 *   node scripts/mint-reserve-schedule.mjs            # DRY-RUN: pokaż harmonogram
 *   node scripts/mint-reserve-schedule.mjs --apply    # wykonaj minty (wymaga PRIVATE_KEY + NETWORK)
 *   node scripts/mint-reserve-schedule.mjs --planeta Mars --apply
 *
 * Konfiguracja planet (przypisanie lat — D2 w projekcie 13, do potwierdzenia Kapitana):
 *   Mars 10, Venus 15, Jupiter 20, Saturn 25, Mercury 30, Uranus 35, Neptune 40, Pluto 50
 */
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const NETWORKS = {
  'base-sepolia': { chainId: 84532, rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  'base':         { chainId: 8453,  rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
};

// [rok od deployu -> rok kalendarzowy] — zakładamy deploy w bieżącym roku.
const UNLOCK_YEARS = {
  Mars: 10, Venus: 15, Jupiter: 20, Saturn: 25,
  Mercury: 30, Uranus: 35, Neptune: 40, Pluto: 50,
};

const RESERVE_PLOTS_PER_PLANET = 2000; // 8 planet × 2000 = 16 000
const CLASS_SPLIT = { S: 0.4, M: 0.3, L: 0.2, XL: 0.1 }; // 800/600/400/200 per planeta

const FULL_PACKAGES = { S: 100, M: 300, L: 900, XL: 2700 }; // Genesis pełne pakiety COSMO

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const planetFilter = args.includes('--planeta') ? args[args.indexOf('--planeta') + 1] : null;

function buildSchedule() {
  const deployYear = new Date().getUTCFullYear();
  const schedule = [];
  for (const [planet, years] of Object.entries(UNLOCK_YEARS)) {
    if (planetFilter && planet !== planetFilter) continue;
    const unlockYear = deployYear + years;
    const unlockDate = new Date(Date.UTC(unlockYear, 0, 1)); // 1 stycznia roku odblokowania
    const unlockTs = Math.floor(unlockDate.getTime() / 1000);
    const perClass = {};
    let cosmoTotal = 0;
    for (const [cls, frac] of Object.entries(CLASS_SPLIT)) {
      const n = Math.round(RESERVE_PLOTS_PER_PLANET * frac);
      perClass[cls] = n;
      cosmoTotal += n * FULL_PACKAGES[cls];
    }
    schedule.push({
      planet, unlockInYears: years, unlockYear, unlockTimestamp: unlockTs,
      plotsPerClass: perClass, cosmoPerPlanet: cosmoTotal,
    });
  }
  return schedule;
}

function renderTable(s) {
  console.log(`\nHarmonogram rezerwatu (deploy rok: ${new Date().getUTCFullYear()}):`);
  console.log(`${'Planeta'.padEnd(10)} ${'Unlock'.padEnd(8)} ${'Rok'.padEnd(6)} ${'S'.padEnd(5)} ${'M'.padEnd(5)} ${'L'.padEnd(5)} ${'XL'.padEnd(5)} ${'COSMO'.padEnd(10)}`);
  let totalPlots = 0, totalCosmo = 0;
  for (const p of s) {
    const c = p.plotsPerClass;
    console.log(`${p.planet.padEnd(10)} ${String(p.unlockInYears).padEnd(8)} ${String(p.unlockYear).padEnd(6)} ${String(c.S).padEnd(5)} ${String(c.M).padEnd(5)} ${String(c.L).padEnd(5)} ${String(c.XL).padEnd(5)} ${String(p.cosmoPerPlanet).padEnd(10)}`);
    totalPlots += c.S + c.M + c.L + c.XL;
    totalCosmo += p.cosmoPerPlanet;
  }
  console.log('-'.repeat(60));
  console.log(`RAZEM: ${totalPlots} działek rezerwatu = ${totalCosmo} COSMO (pełne pakiety Genesis)`);
  console.log(`Kontrola tokenomiki: 16 000 × średnia 580 = 9 280 000 — ${totalCosmo === 9280000 ? '✅ OK' : `⚠️ ${totalCosmo}`}`);
}

async function applySchedule(schedule) {
  if (!process.env.PRIVATE_KEY) throw new Error('Brak PRIVATE_KEY (wymagane do --apply)');
  const network = process.env.NETWORK || 'base-sepolia';
  const cfg = NETWORKS[network];
  if (!cfg) throw new Error(`Nieznana sieć: ${network}`);
  const deedArtifact = JSON.parse(fs.readFileSync(path.join(root, 'build', 'CosmicLandsDeedV2.json'), 'utf8'));
  const deedAddr = process.env.DEED_ADDRESS;
  if (!deedAddr) throw new Error('Brak DEED_ADDRESS (adres CosmicLandsDeedV2)');

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const deed = new ethers.Contract(deedAddr, deedArtifact.abi, wallet);
  const vaultAddr = process.env.VAULT_ADDRESS || wallet.address; // docelowo: vault banku

  console.log(`\nMint rezerwatu → ${vaultAddr} na ${network} (${cfg.chainId})`);
  for (const p of schedule) {
    const c = p.plotsPerClass;
    for (const [cls, n] of Object.entries(c)) {
      for (let i = 1; i <= n; i++) {
        const plotId = `${p.planet.toUpperCase().slice(0, 4)}-RES-${String(i).padStart(6, '0')}`;
        const tokenUri = `ipfs://RESERVE/${plotId}.json`; // placeholder — docelowo IPFS Pinata
        const tx = await deed.mintReserveDeed(vaultAddr, plotId, tokenUri, p.unlockTimestamp);
        console.log(`  mint ${plotId} (${cls}) unlock ${p.unlockYear} — tx ${tx.hash}`);
        await tx.wait();
      }
    }
    console.log(`✅ ${p.planet}: ${Object.values(c).reduce((a, b) => a + b, 0)} działek, unlock ${p.unlockInYears} lat`);
  }
  const out = path.join(root, 'build', 'reserve-mint-log.json');
  fs.writeFileSync(out, JSON.stringify({ network, at: new Date().toISOString(), schedule }, null, 2));
  console.log(`Log: ${out}`);
}

const schedule = buildSchedule();
renderTable(schedule);

// zapis harmonogramu (zawsze, do dalszego użytku)
const outFile = path.join(root, 'build', 'reserve-schedule.json');
fs.writeFileSync(outFile, JSON.stringify(schedule, null, 2));
console.log(`Harmonogram zapisany: ${outFile}`);

if (APPLY) {
  await applySchedule(schedule).catch(e => { console.error('❌', e.message); process.exit(1); });
} else {
  console.log('\nDRY-RUN — nic nie mintowano. Wykonanie: --apply (wymaga PRIVATE_KEY, NETWORK, DEED_ADDRESS).');
}
