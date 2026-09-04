// Weryfikacja po dolutowaniu #1024 (read-only).
import { JsonRpcProvider, Contract } from 'ethers';
import fs from 'node:fs';
const provider=new JsonRpcProvider('https://sepolia.base.org');
const deed=new Contract('0xeB503fEC1a553d6d8E85cC4d9E4c7B04ceb664C4',
  JSON.parse(fs.readFileSync('build/CosmicLandsDeed.json','utf8')).abi, provider);
const cosmo=new Contract('0x0732De3a42A516bbF8b2440331E9156c5EEd91ff',
  JSON.parse(fs.readFileSync('build/CosmoToken.json','utf8')).abi, provider);
const PH='0xbd5F9E61eA0633097054607351bE648e55b6AdD5';
const F0='0xF01ce557F135ed04fa2d042584CFBF7457ee927c';
await new Promise(r=>setTimeout(r,4000));
const tok=await deed.plotToToken('SATURN-PLOT-004127');
console.log('SATURN-004127 tok:', Number(tok), '| owner:', await deed.ownerOf(tok));
console.log('totalMinted:', Number(await deed.totalMinted()));
console.log('COSMO 0xbd5F:', Number(await cosmo.balanceOf(PH))/1e18);
console.log('COSMO 0xF01c:', Number(await cosmo.balanceOf(F0))/1e18);
console.log('NFT 0xbd5F:', Number(await deed.balanceOf(PH)));
console.log('NFT 0xF01c:', Number(await deed.balanceOf(F0)));
