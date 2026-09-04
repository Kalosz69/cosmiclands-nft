// Diagnoza zamowien #1022-#1027: NFT dzialek + salda COSMO portfeli Phantom + historia transferow.
import { JsonRpcProvider, Contract } from 'ethers';
import fs from 'node:fs';

const RPC='https://sepolia.base.org';
const DEED='0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4';
const COSMO='0x0732De3a42A516bbF8b2440331E9156c5EEd91ff';
const provider=new JsonRpcProvider(RPC);
const deedArt=JSON.parse(fs.readFileSync('build/CosmicLandsDeed.json','utf8'));
const cosmoArt=JSON.parse(fs.readFileSync('build/CosmoToken.json','utf8'));
const deed=new Contract(DEED, deedArt.abi, provider);
const cosmo=new Contract(COSMO, cosmoArt.abi, provider);

const plots=['MARS-PLOT-001233','PLUTO-PLOT-007017','SATURN-PLOT-004127','MERCURY-PLOT-007202','SATURN-PLOT-004557','SATURN-PLOT-006095'];
const phantoms=['0xbd5F9E61eA0633097054607351bE648e55b6AdD5','0xF01ce557F135ed04fa2d042584CFBF7457ee927c'];

console.log('=== NFT dzialek z zamowien ===');
for(const p of plots){
  try{
    const tok=await deed.plotToToken(p);
    if(tok===0n){ console.log(`${p}: BRAK NFT (plotToToken=0)`); }
    else{
      const owner=await deed.ownerOf(tok);
      console.log(`${p}: tok=${tok} owner=${owner}`);
    }
  }catch(e){ console.log(`${p}: BRAK NFT (${String(e).slice(0,60)})`); }
}
console.log('\n=== Salda COSMO Phantom ===');
for(const w of phantoms){
  const bal=await cosmo.balanceOf(w);
  console.log(`${w}: ${Number(bal)/1e18} COSMO`);
}
console.log('\n=== Salda NFT (Deed) Phantom ===');
for(const w of phantoms){
  const n=await deed.balanceOf(w);
  console.log(`${w}: ${n} NFT`);
}
console.log('\n=== Ostatnie transfery COSMO do Phantomow (ostatnie 6000 blokow ~ 10h) ===');
const blk=await provider.getBlockNumber();
const t=await cosmo.queryFilter(cosmo.filters.Transfer(null,null,phantoms[0]), blk-6000, blk);
const t2=await cosmo.queryFilter(cosmo.filters.Transfer(null,null,phantoms[1]), blk-6000, blk);
for(const e of t) console.log(`→0xbd5F: ${Number(e.args.value)/1e18} COSMO tx=${e.transactionHash.slice(0,18)}… blk=${e.blockNumber}`);
for(const e of t2) console.log(`→0xF01c: ${Number(e.args.value)/1e18} COSMO tx=${e.transactionHash.slice(0,18)}… blk=${e.blockNumber}`);
