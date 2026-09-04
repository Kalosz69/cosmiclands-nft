import { JsonRpcProvider, Contract } from 'ethers';
import fs from 'fs';
const v = JSON.parse(fs.readFileSync('build/deployed-vault.json','utf8'));
const c = JSON.parse(fs.readFileSync('build/deployed-cosmo.json','utf8'));
const d = JSON.parse(fs.readFileSync('build/deployed-deed.json','utf8'));
const p = new JsonRpcProvider('https://sepolia.base.org');
const vault = new Contract(v.address, [
  'function owner() view returns (address)',
  'function unlockTime() view returns (uint256)',
  'function cosmo() view returns (address)',
  'function deed() view returns (address)',
  'function cosmoBalance() view returns (uint256)',
], p);
console.log('vault:', v.address);
console.log('owner:', await vault.owner());
console.log('unlockTime:', Number(await vault.unlockTime()), '→', new Date(Number(await vault.unlockTime())*1000).toISOString());
console.log('cosmo addr:', await vault.cosmo(), '| zgodny z deployed-cosmo:', (await vault.cosmo()).toLowerCase()===c.address.toLowerCase());
console.log('deed addr:', await vault.deed(), '| zgodny z deployed-deed:', (await vault.deed()).toLowerCase()===d.address.toLowerCase());
console.log('cosmoBalance:', Number(await vault.cosmoBalance())/1e18);
