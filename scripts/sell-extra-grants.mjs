// Dokończenie grantów z sell-extra (2 szt.) — ten sam reżim nonce co sell-extra.mjs
import { JsonRpcProvider, Contract, HDNodeWallet } from 'ethers';
import fs from 'node:fs';

const provider=new JsonRpcProvider('https://sepolia.base.org');
const net=await provider.getNetwork();
if(net.chainId!==84532n){ console.error('CHAINID_GUARD STOP'); process.exit(1); }
const raw=fs.readFileSync('/opt/data/.secrets/trust walet.txt','utf8');
const lines=raw.split(/\r?\n/);
const li=lines.findIndex(l=>/^secret:/i.test(l.trim()));
const phrase=(lines[li].replace(/^secret:\s*/i,'').trim())||lines.slice(li+1).find(l=>l.trim())?.trim();
const op=HDNodeWallet.fromPhrase(phrase).connect(provider);
const cosmo=new Contract('0x0732De3a42A516bbF8b2440331E9156c5EEd91ff',
  JSON.parse(fs.readFileSync('build/CosmoToken.json','utf8')).abi, op);

const TASKS=[
  ['MARS-PLOT-000617',  100],
  ['VENUS-PLOT-000001', 100],
];
const BUYER={ 'MARS-PLOT-000617':'0xb66AF38AC26b9023F138399f7633094AA85b055A',
              'VENUS-PLOT-000001':'0xD197fEA004F3c6Fd3B7657b2eD32D8eCFA9EE880' };

for(const [plot,amt] of TASKS){
  const nonce=await provider.getTransactionCount(await op.getAddress(),'pending');
  const tx=await cosmo.transfer(BUYER[plot], BigInt(amt), {nonce});
  const rc=await tx.wait();
  if(rc.status!==1) throw new Error(`status ${rc.status}`);
  console.log(`${plot}: ✅ grant ${amt} COSMO → ${BUYER[plot].slice(0,8)}… tx=${tx.hash} block=${rc.blockNumber}`);
  await new Promise(r=>setTimeout(r,1200));
}
console.log('GRANTY KOMPLETNE');
