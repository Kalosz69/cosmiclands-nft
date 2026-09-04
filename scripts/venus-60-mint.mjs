// VENUS-60 faza A: mint+grant dla 58 działek (2 skip). Ten sam reżim co sell-extra:
// CHAINID_GUARD, jawny nonce pending, wait() po każdym tx, tokenId z logów receiptu,
// retry odczytu, log po każdej iteracji, resume po plot_id.
import { JsonRpcProvider, Contract, HDNodeWallet } from 'ethers';
import fs from 'node:fs';

const RPC='https://sepolia.base.org';
const CHAINID=84532n;
const DEED='0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4';
const COSMO='0x0732De3a42A516bbF8b2440331E9156c5EEd91ff';

const provider=new JsonRpcProvider(RPC);
const {chainId}=await provider.getNetwork();
if(chainId!==CHAINID){ console.error(`CHAINID_GUARD: ${chainId} != 84532 — STOP`); process.exit(1); }

const raw=fs.readFileSync('/opt/data/.secrets/trust walet.txt','utf8');
const lines=raw.split(/\r?\n/);
const li=lines.findIndex(l=>/^secret:/i.test(l.trim()));
const phrase=(lines[li].replace(/^secret:\s*/i,'').trim())||lines.slice(li+1).find(l=>l.trim())?.trim();
if(!phrase||phrase.split(/\s+/).length!==12) throw new Error('seed parse fail');
const op=HDNodeWallet.fromPhrase(phrase).connect(provider);

const deed=new Contract(DEED, JSON.parse(fs.readFileSync('build/CosmicLandsDeed.json','utf8')).abi, op);
const cosmo=new Contract(COSMO, JSON.parse(fs.readFileSync('build/CosmoToken.json','utf8')).abi, op);

const tasks=JSON.parse(fs.readFileSync('build/venus-60-tasks.json','utf8'));
const OUT='build/venus-60-results.json';
const done=new Set(fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')).filter(r=>r.ok).map(r=>r.plot):[]);

const results=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):[];
let ok=0,fail=0;
async function nextNonce(){ return await provider.getTransactionCount(await op.getAddress(),'pending'); }

for(const t of tasks){
  if(done.has(t.plot)){ continue; }
  const row={plot:t.plot, buyer:t.buyer, cls:t.cls, tokenId:null, mintTx:null, grantTx:null};
  try{
    // idempotentność: czy już zmintowane?
    let existing=0n;
    for(let a=0;a<3;a++){ try{ existing=await deed.plotToToken(t.plot); break; }catch(e){ await new Promise(r=>setTimeout(r,1500)); } }
    if(existing && existing!==0n){
      row.tokenId=Number(existing); row.skipped=true; row.ok=true;
      console.log(`${t.plot}: ⏭ już zmintowana (tok=${row.tokenId})`);
    }else{
      const nonce=await nextNonce();
      const mTx=await deed.mintDeed(t.buyer, t.plot, '', {nonce});
      const mrc=await mTx.wait();
      if(mrc.status!==1) throw new Error(`mint receipt status ${mrc.status}`);
      row.mintTx=mTx.hash;
      for(const lg of (mrc.logs||[])){ if(lg.topics?.length===4&&lg.topics[3]){ row.tokenId=Number(BigInt(lg.topics[3])); break; } }
      console.log(`${t.plot}: ✅ mint tok=${row.tokenId} blk=${mrc.blockNumber} (nonce ${nonce})`);
    }
    // grant (też dla skipped — complete package)
    const nonce2=await nextNonce();
    const gTx=await cosmo.transfer(t.buyer, BigInt(t.cosmo), {nonce:nonce2});
    const grc=await gTx.wait();
    if(grc.status!==1) throw new Error(`grant receipt status ${grc.status}`);
    row.grantTx=gTx.hash; row.ok=true;
    console.log(`${t.plot}: ✅ grant ${t.cosmo} COSMO (nonce ${nonce2})`);
    ok++;
  }catch(e){
    row.ok=false; row.error=String(e).slice(0,160); fail++;
    console.log(`${t.plot}: ❌ ${row.error}`);
  }
  results.push(row);
  fs.writeFileSync(OUT, JSON.stringify(results,null,1));
  await new Promise(r=>setTimeout(r,700));
}
console.log(`\nFAZA A: ${ok} OK / ${fail} FAIL (łącznie w pliku: ${results.length})`);
