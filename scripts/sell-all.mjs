// SELL-ALL: 48 dostępnych działek Marsa (KV 60 minus 6 już testowych) — mint + COSMO grant każdy.
// Kupujący naprzemiennie: 0xD197… (parzyste) / 0xb66A… (nieparzyste) — oba Twoje portfele.
// Wszystko Base Sepolia (84532). Log: build/sell-all-results.json
import { JsonRpcProvider, Contract, HDNodeWallet, NonceManager } from 'ethers';
import fs from 'node:fs';

const RPC='https://sepolia.base.org';
const DEED='0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4';
const COSMO='0x0732De3a42A516bbF8b2440331E9156c5EEd91ff';
const A='0xD197fEA004F3c6Fd3B7657b2eD32D8eCFA9EE880';
const B='0xb66AF38AC26b9023F138399f7633094AA85b055A';

const raw=fs.readFileSync('/opt/data/.secrets/trust walet.txt','utf8');
const lines=raw.split(/\r?\n/);
const li=lines.findIndex(l=>/^secret:/i.test(l.trim()));
const phrase=(lines[li].replace(/^secret:\s*/i,'').trim())||lines.slice(li+1).find(l=>l.trim())?.trim();
if(!phrase||phrase.split(/\s+/).length!==12) throw new Error('seed parse fail');

const provider=new JsonRpcProvider(RPC);
const op=new NonceManager(HDNodeWallet.fromPhrase(phrase)).connect(provider);
const deedArt=JSON.parse(fs.readFileSync('build/CosmicLandsDeed.json','utf8'));
const cosmoArt=JSON.parse(fs.readFileSync('build/CosmoToken.json','utf8'));
const deed=new Contract(DEED, deedArt.abi, op);
const cosmo=new Contract(COSMO, cosmoArt.abi, op);

const queue=JSON.parse(fs.readFileSync('build/sell-all-queue.json','utf8'));
const results=[]; let i=0, fails=0, skipped=0;
for(const p of queue){
  i++;
  const buyer=(i%2===1)?A:B;
  // SKIP: działka już zmintowana? (plotToToken zwraca tokenId != 0)
  try{
    const existing=await deed.plotToToken(p.plot_id);
    if(existing && existing!==0n){
      skipped++;
      results.push({plot:p.plot_id, cls:p.mf_class, buyer, tokenId:Number(existing), skipped:true});
      console.log(`[${i}/48] ⏭ ${p.plot_id} już zmintowana (tok=${Number(existing)}) — pomijam`);
      continue;
    }
  }catch(e){ /* plotToToken rzuci dla nieistniejących — jedziemy dalej */ }
  try{
    const mintTx=await deed.mintDeed(buyer, p.plot_id, '');
    const mrc=await mintTx.wait();
    const tok=Number(await deed.totalMinted());
    const gTx=await cosmo.transfer(buyer, BigInt(p.mf_cosmo_tokens));
    const grc=await gTx.wait();
    results.push({plot:p.plot_id, cls:p.mf_class, region:p.mf_region, buyer,
      tokenId:tok, mintTx:mintTx.hash, grantTx:gTx.hash, certSent:false, mailed:false});
    console.log(`[${i}/48] ✅ ${p.plot_id} (${p.mf_class}) tok=${tok} → ${buyer.slice(0,8)}…`);
    await new Promise(r=>setTimeout(r, 800)); // odstęp anty-"already known"
  }catch(e){
    fails++;
    results.push({plot:p.plot_id, cls:p.mf_class, buyer, error:String(e).slice(0,140)});
    console.log(`[${i}/48] ❌ ${p.plot_id}: ${String(e).slice(0,100)}`);
    await new Promise(r=>setTimeout(r, 1200));
  }
}
fs.writeFileSync('build/sell-all-results.json', JSON.stringify(results,null,1));
console.log(`\nWYNIK: ${results.filter(r=>!r.error&&!r.skipped).length} OK / ${skipped} skipped / ${fails} FAIL`);
