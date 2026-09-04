// Dolutowanie #1024: SATURN-PLOT-004127 -> 0xbd5F…AdD5 (mint + grant 900).
// Ten sam reżim: CHAINID_GUARD, jawny nonce, wait(), tokenId z receipt logs.
import { JsonRpcProvider, Contract, HDNodeWallet } from 'ethers';
import fs from 'node:fs';

const RPC='https://sepolia.base.org';
const DEED='0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4';
const COSMO='0x0732De3a42A516bbF8b2440331E9156c5EEd91ff';
const BUYER='0xbd5F9E61eA0633097054607351bE648e55b6AdD5';
const PLOT='SATURN-PLOT-004127';
const COSMO_AMT=900n*10n**18n;

const net=await new JsonRpcProvider(RPC).getNetwork();
if(Number(net.chainId)!==84532) throw new Error('CHAINID '+net.chainId);

const raw=fs.readFileSync('/opt/data/.secrets/trust walet.txt','utf8');
const lines=raw.split(/\r?\n/);
const li=lines.findIndex(l=>/^secret:/i.test(l.trim()));
const phrase=(lines[li].replace(/^secret:\s*/i,'').trim())||lines.slice(li+1).find(l=>l.trim())?.trim();
if(!phrase||phrase.split(/\s+/).length!==12) throw new Error('seed parse fail');

const provider=new JsonRpcProvider(RPC);
const op=HDNodeWallet.fromPhrase(phrase).connect(provider);
const deed=new Contract(DEED, JSON.parse(fs.readFileSync('build/CosmicLandsDeed.json','utf8')).abi, op);
const cosmo=new Contract(COSMO, JSON.parse(fs.readFileSync('build/CosmoToken.json','utf8')).abi, op);

const existing=await deed.plotToToken(PLOT);
if(existing!==0n){ console.log(`${PLOT} juz zmintowany tok=${existing} — nie mintuję ponownie`); process.exit(0); }

const nonce1=await provider.getTransactionCount(await op.getAddress(),'pending');
const mTx=await deed.mintDeed(BUYER, PLOT, '', {nonce:nonce1});
const mrc=await mTx.wait();
if(mrc.status!==1) throw new Error('mint status '+mrc.status);
let tok=null;
for(const lg of (mrc.logs||[])){ if(lg.topics?.length===4&&lg.topics[3]){ tok=Number(BigInt(lg.topics[3])); break; } }
console.log(`mint OK tok=${tok} tx=${mTx.hash} blk=${mrc.blockNumber}`);

const nonce2=await provider.getTransactionCount(await op.getAddress(),'pending');
const gTx=await cosmo.transfer(BUYER, COSMO_AMT, {nonce:nonce2});
const grc=await gTx.wait();
if(grc.status!==1) throw new Error('grant status '+grc.status);
console.log(`grant 900 COSMO OK tx=${gTx.hash} blk=${grc.blockNumber}`);

const owner=await deed.ownerOf(tok);
const bal=await cosmo.balanceOf(BUYER);
console.log(`VERIFY: ownerOf(${tok})=${owner} | COSMO ${BUYER.slice(0,8)}…=${Number(bal)/1e18}`);
