// SELL-EXTRA (27.08): dolutowanie 2 Mars-fail + test E2E na Wenus (inna planeta).
// Fix root-cause kolizji nonce: jawny nonce z getTransactionCount('pending') przed KAŻDYM tx,
// wait() po KAŻDYM tx, zero równoległości. CHAINID_GUARD: odmowa poza 84532.
// Log: build/sell-extra-results.json
import { JsonRpcProvider, Contract, HDNodeWallet } from 'ethers';
import fs from 'node:fs';

const RPC='https://sepolia.base.org';
const DEED='0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4';
const COSMO='0x0732De3a42A516bbF8b2440331E9156c5EEd91ff';
const A='0xD197fEA004F3c6Fd3B7657b2eD32D8eCFA9EE880';
const B='0xb66AF38AC26b9023F138399f7633094AA85b055A';

const provider=new JsonRpcProvider(RPC);
const net=await provider.getNetwork();
if(net.chainId!==84532n){ console.error(`CHAINID_GUARD: ${net.chainId} != 84532 — STOP`); process.exit(1); }

const raw=fs.readFileSync('/opt/data/.secrets/trust walet.txt','utf8');
const lines=raw.split(/\r?\n/);
const li=lines.findIndex(l=>/^secret:/i.test(l.trim()));
const phrase=(lines[li].replace(/^secret:\s*/i,'').trim())||lines.slice(li+1).find(l=>l.trim())?.trim();
if(!phrase||phrase.split(/\s+/).length!==12) throw new Error('seed parse fail');
const op=HDNodeWallet.fromPhrase(phrase).connect(provider);

const deedArt=JSON.parse(fs.readFileSync('build/CosmicLandsDeed.json','utf8'));
const cosmoArt=JSON.parse(fs.readFileSync('build/CosmoToken.json','utf8'));
const deed=new Contract(DEED, deedArt.abi, op);
const cosmo=new Contract(COSMO, cosmoArt.abi, op);

const manifest=JSON.parse(fs.readFileSync('all-planets-manifest-v3.json','utf8'));
const mf=Object.fromEntries(manifest.map(r=>[r.plot_id,r]));

// Zadania: [plot, buyer, czyMint]; kwota COSMO zawsze z manifestu.
// Domyślny zestaw; można nadpisać: node sell-extra.mjs --tasks build/sell-multi-tasks.json
let TASKS=[
  ['MARS-PLOT-000617', B, true ],   // dolutowanie: mint + grant
  ['MARS-PLOT-000247', B, false],   // NFT już jest (tok 2010): tylko grant
  ['VENUS-PLOT-000001', A, true ],  // test inna planeta: mint + grant
  ['VENUS-PLOT-000247', B, true ],  // test inna planeta: mint + grant
];
const ti=process.argv.indexOf('--tasks');
if(ti>0){
  TASKS=JSON.parse(fs.readFileSync(process.argv[ti+1],'utf8'));
  console.log(`Zadania z pliku: ${process.argv[ti+1]} (${TASKS.length} szt.)`);
}
const oi=process.argv.indexOf('--out');
const OUT_FILE=oi>0?process.argv[oi+1]:'build/sell-extra-results.json';

async function nextNonce(){ return await provider.getTransactionCount(await op.getAddress(),'pending'); }

const results=[]; let ok=0, fails=0;
for(const [plot,buyer,doMint] of TASKS){
  const cosmoAmt=BigInt(mf[plot].mf_cosmo_tokens);
  const row={plot, planet:mf[plot].mf_planet, cls:mf[plot].mf_class, buyer, cosmo:String(cosmoAmt)};
  try{
    if(doMint){
      const existing=await deed.plotToToken(plot);
      if(existing && existing!==0n){
        row.skipped=true; row.tokenId=Number(existing);
        console.log(`${plot}: już zmintowana (tok=${row.tokenId}) — pomijam mint`);
      }else{
        const nonce=await nextNonce();
        const mTx=await deed.mintDeed(buyer, plot, '', {nonce});
        const mrc=await mTx.wait();
        if(mrc.status!==1) throw new Error(`mint receipt status ${mrc.status}`);
        row.mintTx=mTx.hash; row.mintBlock=mrc.blockNumber;
        // tokenId z logów receiptu (Transfer topic3) — NIE eth_call zaraz po tx (stale-read RPC)
        for(const lg of (mrc.logs||[])){
          if(lg.topics?.length===4 && lg.topics[3]){ row.tokenId=Number(BigInt(lg.topics[3])); break; }
        }
        console.log(`${plot}: ✅ mint tok=${row.tokenId??'?'} tx=${mTx.hash.slice(0,10)}… block=${mrc.blockNumber} (nonce ${nonce})`);
      }
    }
    let tok=row.tokenId||Number(await deed.plotToToken(plot));
    if(!tok){ // fallback z retrym (publiczny RPC bywa zaległy)
      for(let a=0;a<5&&!tok;a++){ await new Promise(r=>setTimeout(r,2000)); tok=Number(await deed.plotToToken(plot)); }
    }
    row.tokenId=tok;
    if(!tok) throw new Error('brak tokenId po mincie — STOP');
    // grant — zawsze osobnym tx z jawnym nonce
    const nonce2=await nextNonce();
    const gTx=await cosmo.transfer(buyer, cosmoAmt, {nonce: nonce2});
    const grc=await gTx.wait();
    if(grc.status!==1) throw new Error(`grant receipt status ${grc.status}`);
    row.grantTx=gTx.hash; row.grantBlock=grc.blockNumber;
    console.log(`${plot}: ✅ grant ${cosmoAmt} COSMO → ${buyer.slice(0,8)}… tx=${gTx.hash.slice(0,10)}… (nonce ${nonce2})`);
    ok++; results.push(row);
  }catch(e){
    fails++; row.error=String(e).slice(0,160); results.push(row);
    console.log(`${plot}: ❌ ${row.error}`);
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(results,null,1));
}
fs.writeFileSync(OUT_FILE, JSON.stringify(results,null,1));
console.log(`\nWYNIK: ${ok} OK / ${fails} FAIL (totalMinted teraz: ${Number(await deed.totalMinted())})`);
