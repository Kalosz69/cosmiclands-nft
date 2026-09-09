// rescue-canon32-download.mjs — RATUNEK read-only: pobiera z CDN Shopify pliki kanonu 32,
// których już NIE MA w bibliotece Files (skasowane ręcznie przez K), a które CDN jeszcze
// serwuje z cache (200 OK — okno czasowe!). Zapis: assets/canon32-restore/.
// URL-e (z parametrami v=) z mappingu set-media-480.mjs (lista K z 03.09). ZERO mutacji Shopify.
import fs from 'node:fs';
const C='https://cdn.shopify.com/s/files/1/1042/7367/4581/files';
// pełny mapping z set-media-480.mjs (planeta-klasa → plik CDN z ?v=)
const MAP={
 'mars-plot-s.jpg':'?v=1778230340','mars-plot-m.jpg':'?v=1778230340','mars-plot-l.jpg':'?v=1778230340','mars-plot-xl.jpg':'?v=1778230339',
 'Pluto_S.png':'?v=1788356320','pluto-m_aeb4186d-a814-41a0-83f9-9576dd9ffc7c.png':'?v=1778959846','pluto-l.png':'?v=1778959839','pluto-xl.png':'?v=1778959836',

 'mercury-s.png':'?v=1778960416','mercury-m_fec7fbee-a325-46f0-8db0-21b5ce4593fb.png':'?v=1778960425','mercury-l.png':'?v=1778960418','mercury-xl.png':'?v=1778960422',
 'jupiter-s.png':'?v=1778960546','jupiter-m.png':'?v=1778960548','jupiter-l.png':'?v=1778960559','jupiter-xl.png':'?v=1778960551',
 'saturn-s.png':'?v=1778956432','saturn-m.png':'?v=1778956434','saturn-l.png':'?v=1778956435','saturn-xl.png':'?v=1778956438',
 'neptune-s.png':'?v=1778958830','neptune-m.png':'?v=1778958830','neptune-l.png':'?v=1778958832','neptune-xl.png':'?v=1778958835',
 'uranus-s.png':'?v=1778960173','uranus-m_6eb5b0f5-a939-4be3-afe0-f53308ee45bb.png':'?v=1778960182','uranus-l.png':'?v=1778960175','uranus-xl.png':'?v=1778960184',
 'venus-s.png':'?v=1778956065','venus-m.png':'?v=1778956067','venus-l.png':'?v=1778956068','venus-xl.png':'?v=1778956070',
};
// najnowszy raport stanu → co faktycznie brakuje w bibliotece
const repPath=process.argv[2];
const rep=JSON.parse(fs.readFileSync(repPath,'utf8'));
const have=new Set(rep.files.map(f=>f.name));
const outDir='/opt/data/workspace/cosmiclands-nft/assets/canon32-restore';
fs.mkdirSync(outDir,{recursive:true});
let ok=0, fail=[];
for(const name of Object.keys(MAP)){
  if(have.has(name)) { console.log('w bibliotece, pomijam:', name); continue; }
  const url=`${C}/${name}${MAP[name]}`;
  const res=await fetch(url);
  if(!res.ok){ fail.push(`${name} → HTTP ${res.status}`); console.log('FAIL', name, res.status); continue; }
  const buf=Buffer.from(await res.arrayBuffer());
  // zapis pod CZYSTĄ nazwą kanonu (bez UUID), żeby upload wiedział co to
  const clean=name.split('_')[0].startsWith('pluto-m')&&name.includes('aeb4186d')?'pluto-m.png'
    :name.includes('fec7fbee')?'mercury-m.png':name.includes('6eb5b0f5')?'uranus-m.png':name;
  fs.writeFileSync(`${outDir}/${clean}`, buf);
  console.log(`OK ${clean} ← ${name} (${(buf.length/1024).toFixed(0)} kB)`);
  ok++;
}
console.log(`\nratowane: ${ok} | fail: ${fail.length}`);
if(fail.length) console.log(fail.join('\n'));
