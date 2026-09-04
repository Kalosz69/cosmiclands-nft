#!/usr/bin/env node
/**
 * grant-cosmo.mjs — grant (transfer) COSMO wg klasy działki. Orchestrator v1 (biblia 22 §4).
 * Reżim 1:1 z sell-extra-grants.mjs (phrase z trust walet.txt, nonce=pending, CHAINID_GUARD 84532).
 * Użycie:
 *   node scripts/grant-cosmo.mjs --to 0xD197...E880 --amount 100
 * Wyjście (parse dla pollera): "GRANT_OK tx=0x… amount=100 to=0x…"
 */
import { JsonRpcProvider, Contract, HDNodeWallet } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const to = getArg('--to');
const amount = getArg('--amount');

if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) { console.error(`GRANT_FAIL: zły adres: ${to}`); process.exit(1); }
if (!amount || !/^\d+$/.test(amount)) { console.error(`GRANT_FAIL: zła kwota: ${amount}`); process.exit(1); }

const provider = new JsonRpcProvider(process.env.RPC_URL || 'https://sepolia.base.org');
const net = await provider.getNetwork();
if (net.chainId !== 84532n) { console.error(`CHAINID_GUARD STOP: ${net.chainId}`); process.exit(1); }

const raw = fs.readFileSync(process.env.WALLET_FILE || '/opt/data/.secrets/trust walet.txt', 'utf8');
const lines = raw.split(/\r?\n/);
const li = lines.findIndex(l => /^secret:/i.test(l.trim()));
const phrase = (li >= 0 ? lines[li].replace(/^secret:\s*/i, '').trim() : '') || lines.slice(li + 1).find(l => l.trim())?.trim();
if (!phrase) { console.error('GRANT_FAIL: brak seed w wallet file'); process.exit(1); }

const op = HDNodeWallet.fromPhrase(phrase).connect(provider);
const COSMO_ADDR = process.env.COSMO_ADDR || '0x0732De3a42A516bbF8b2440331E9156c5EEd91ff';
const cosmo = new Contract(COSMO_ADDR, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'CosmoToken.json'), 'utf8')).abi, op);

const nonce = await provider.getTransactionCount(await op.getAddress(), 'pending');
// BUGFIX 01.09 (MT-02 wykrył): ERC-20 transfer przyjmuje WEI — amount to tokeny → *1e18.
// Wcześniej szło 300 wei zamiast 300 tokenów (tx status=1, saldo bez zmian).
const amt = BigInt(amount) * 10n ** 18n;
const tx = await cosmo.transfer(to, amt, { nonce });
const rc = await tx.wait();
if (rc.status !== 1) { console.error(`GRANT_FAIL: status ${rc.status}`); process.exit(1); }
console.log(`GRANT_OK tx=${tx.hash} amount=${amount} wei=${amt.toString()} to=${to} block=${rc.blockNumber}`);
