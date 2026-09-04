// CERT+MAIL sell-all: generuje premium PDF dla każdego OK wyniku i wysyła maile
// (22 → jarek.galosz@gmail.com, 22 → kalosorama@gmail.com), partiami z odstępami.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const results=JSON.parse(fs.readFileSync('build/sell-all-results.json','utf8'));
const ok=results.filter(r=>!r.error && !r.skipped);

// manifest v3 = źródło koordynat/COSMO/regionu per działka (480 rekordów, 8 planet × 60)
const manifest=JSON.parse(fs.readFileSync('all-planets-manifest-v3.json','utf8'));
const mf=Object.fromEntries(manifest.map(r=>[r.plot_id,r]));
const coordsFor=p=>{const r=mf[p];return r?`${r.mf_coordinates_lat}, ${r.mf_coordinates_lon}`:'—';};
const cosmoFor=p=>{const r=mf[p];return (r&&r.mf_cosmo_tokens!=null)?String(r.mf_cosmo_tokens):'';};
const regionFor=(p,f)=>{const r=mf[p];return (r&&r.mf_region_name)||f||'Mars';};
const areaFor=(p,f)=>{const r=mf[p];return (r&&r.mf_area_ha)?`${r.mf_area_ha} ha`:f;};
const priceFor=(p,f)=>{const r=mf[p];return (r&&r.mf_price_eur!=null)?`${r.mf_price_eur} EUR`:f;};

const META={
  S:{area:'0.5 ha', price:'50 EUR'}, M:{area:'2.5 ha', price:'129 EUR'},
  L:{area:'6.5 ha', price:'369 EUR'}, XL:{area:'13.5 ha', price:'999 EUR'}
};
const ownerFor=b=>b.startsWith('0xD197')?'Jarek G.':'Kalosorama';
const mailFor=b=>b.startsWith('0xD197')?'jarek.galosz@gmail.com':'kalosorama@gmail.com';

let sent=0, fail=0;
const NO_MAIL=process.argv.includes('--no-mail'); // dry-run: tylko PDF-y, zero SMTP
for(const r of ok){
  const m=META[r.cls]||META.S;
  const pdf=`test-output/${r.plot}-premium.pdf`;
  try{
    execFileSync('node',['scripts/generate-certificate-v3.mjs',
      '--planet','mars','--plot',r.plot,'--owner',ownerFor(r.buyer),
      '--class',r.cls,'--region',regionFor(r.plot,r.region),'--coords',coordsFor(r.plot),
      '--area',areaFor(r.plot,m.area),'--price',priceFor(r.plot,m.price),
      '--cosmo',cosmoFor(r.plot)||String(r.cosmo||''),
      '--cert',`COSMO-2026-${r.tokenId}`,'--token-id',String(r.tokenId),
      '--tx',r.mintTx,'--out',pdf],{stdio:'pipe'});
  }catch(e){ console.log(`PDF FAIL ${r.plot}: ${String(e).slice(0,80)}`); fail++; continue; }

  if(NO_MAIL){ console.log(`PDF OK ${r.plot} (${r.cls}, tok ${r.tokenId}, ${coordsFor(r.plot)})`); sent++; continue; }

  try{
    const out=execFileSync('node',['scripts/send-email.mjs','--to',mailFor(r.buyer),
      '--plot',r.plot,'--pdf',pdf],{stdio:'pipe', env:{...process.env}}).toString();
    const line=out.trim().split('\n').pop();
    console.log(`${r.plot} (${r.cls}, tok ${r.tokenId}) → ${mailFor(r.buyer)}: ${line.slice(0,90)}`);
    sent++;
  }catch(e){ console.log(`MAIL FAIL ${r.plot}: ${String(e).slice(0,80)}`); fail++; }
  await new Promise(res=>setTimeout(res,1500)); // odstęp anty-throttle SMTP
}
console.log(`\nWYSŁANE: ${sent} | BŁĘDY: ${fail}`);
