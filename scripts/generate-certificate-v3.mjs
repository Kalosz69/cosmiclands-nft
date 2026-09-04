#!/usr/bin/env node
/**
 * generate-certificate-v3.mjs — Certyfikat premium v3 (27.08) — unikalny styl per planeta.
 *
 * - pdf-lib (bez zależności zewnętrznych); QR rysowany programowo (QR byte-model,
 *  wersja 3, ECC L, maska 4) → map.cosmiclands.space/?plot=SKU
 * - Paleta per planeta (8 unikalnych stylistyk), złote ramki, grawerowane pasy,
 *   holo-seal, watermark numeru, serif-owe liternatura standard fontami PDF.
 * - Cross-ref v3: NFT tokenId + tx mintu na certyfikacie; pola: owner (imię+nazwisko),
 *   plot, planeta, region, klasy, współrzędne, powierzchnia, cena, COSMO, cert no.
 *
 * Użycie:
 *   node scripts/generate-certificate-v3.mjs --planet mars --plot MARS-PLOT-000001 \
 *     --owner "Jarek G." --class S --region Acidalia --coords "76.5, -36.5" \
 *     --area "0.5 ha" --price "50 EUR" --cosmo 100 --cert COSMO-2026-2004 \
 *     --token-id 2004 --tx 0x… --out test-output/x.pdf
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const QR_LIB=require('qrcode');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i+1] : d; };

// ─── Palety per planeta (tło, akcent, akcent2, name kolor) ───
const PLANET_STYLE = {
  mars:    { name: 'MARS',    bg: [0.09,0.03,0.02], accent: [0.85,0.34,0.13], accent2: [0.93,0.58,0.26], star: [0.98,0.82,0.55], tag: 'THE RED FRONTIER' },
  venus:   { name: 'VENUS',   bg: [0.07,0.06,0.12], accent: [0.95,0.76,0.30], accent2: [0.98,0.90,0.60], star: [1.00,0.95,0.78], tag: 'THE MORNING STAR' },
  jupiter: { name: 'JUPITER', bg: [0.04,0.07,0.10], accent: [0.76,0.50,0.28], accent2: [0.92,0.78,0.60], star: [0.98,0.90,0.72], tag: 'THE GIANT SHIELD' },
  saturn:  { name: 'SATURN',  bg: [0.08,0.07,0.05], accent: [0.87,0.71,0.38], accent2: [0.96,0.87,0.62], star: [0.99,0.94,0.78], tag: 'THE RINGED JEWEL' },
  mercury: { name: 'MERCURY', bg: [0.06,0.06,0.07], accent: [0.70,0.70,0.74], accent2: [0.90,0.90,0.93], star: [0.97,0.97,1.00], tag: 'THE IRON HEART' },
  uranus:  { name: 'URANUS',  bg: [0.02,0.08,0.10], accent: [0.30,0.78,0.82], accent2: [0.62,0.92,0.94], star: [0.85,0.98,1.00], tag: 'THE SIDEWAYS WORLD' },
  neptune: { name: 'NEPTUNE', bg: [0.02,0.04,0.12], accent: [0.25,0.42,0.90], accent2: [0.55,0.72,0.98], star: [0.82,0.90,1.00], tag: 'THE DEEP BLUE' },
  pluto:   { name: 'PLUTO',   bg: [0.05,0.05,0.08], accent: [0.62,0.58,0.72], accent2: [0.84,0.80,0.94], star: [0.94,0.92,1.00], tag: 'THE FROZEN EDGE' },
};
delete PLANET_STYLE.uranus2;

// ─── QR (byte mode, wersja 1–4, ECC L, maska auto) — programowo, bez zależności ───
// Galois GF(256) dla polynom 0x11D
const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
(()=>{ let x=1; for(let i=0;i<255;i++){ GF_EXP[i]=x; GF_LOG[x]=i; x<<=1; if(x&0x100) x^=0x11d; } for(let i=255;i<512;i++) GF_EXP[i]=GF_EXP[i-255]; })();
const gmul=(a,b)=>(a&&b)?GF_EXP[GF_LOG[a]+GF_LOG[b]]:0;
function rsGen(n){ let poly=[1]; for(let i=0;i<n;i++){ const nf=new Array(poly.length+1).fill(0); for(let j=0;j<poly.length;j++){ nf[j]^=gmul(poly[j],1); nf[j+1]^=gmul(poly[j],GF_EXP[i]); } poly=nf; } return poly.slice(1); }
function rsEncode(data, ecLen){ const gen=rsGen(ecLen); const res=new Array(ecLen).fill(0); for(const b of data){ const f=b^res[0]; res.shift(); res.push(0); if(f) for(let j=0;j<ecLen;j++) res[j]^=gmul(gen[j],f); } return res; }
// spec: wersja 3 (29 modułów), ECC L: 55 data codewords, 15 ec; wersja 4 (33), 80 data, 18 ec
const QR_SPECS = {
  3: { size:29, data:55, ec:15 },
  4: { size:33, data:80, ec:18 },
};
function qrMatrix(text){
  // STANDARDOWA biblioteka (po audycie własnego enkodera: 500/1089 bitów różnic vs referencja — wycofane)
  const qr=QR_LIB.create(text,{errorCorrectionLevel:'L'});
  const n=qr.modules.size;
  const m=[]; for(let r=0;r<n;r++){ const row=[]; for(let c=0;c<n;c++) row.push(qr.modules.get(r,c)?1:0); m.push(row); }
  return m;
}

// ─── Parametry wejściowe ───
const planet = (getArg('--planet','mars')||'mars').toLowerCase();
const style = PLANET_STYLE[planet] || PLANET_STYLE.mars;
const plot = getArg('--plot','MARS-PLOT-000001');
const owner = getArg('--owner','Valued Owner');
const cls = getArg('--class','S');
const region = getArg('--region','—');
const area = getArg('--area','0.5 ha');
const price = getArg('--price','50 EUR');
const coords = getArg('--coords','0, 0');
const cosmo = getArg('--cosmo','100');
const certNo = getArg('--cert',`COSMO-2026-${String(100000+Math.floor(Math.random()*90000))}`);
const tokenId = getArg('--token-id','');
const txHash = getArg('--tx','');
const out = getArg('--out', path.join(__dirname,'..','test-output',`${plot}-premium.pdf`));

const mapUrl = `https://map.cosmiclands.space/?plot=${plot}`;

// ─── PDF ───
const pdf = await PDFDocument.create();
pdf.setTitle(`Cosmic Lands — ${style.name} Plot Certificate ${plot}`);
pdf.setAuthor('Cosmic Lands / Rainbow Universe OS');
const page = pdf.addPage([595.28, 841.89]); // A4
const F = {
  bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
  it:   await pdf.embedFont(StandardFonts.TimesRomanItalic),
  rom:  await pdf.embedFont(StandardFonts.TimesRoman),
  sansB: await pdf.embedFont(StandardFonts.HelveticaBold),
  sans: await pdf.embedFont(StandardFonts.Helvetica),
};
const C = { bg: rgb(...style.bg), accent: rgb(...style.accent), accent2: rgb(...style.accent2), gold: rgb(0.83,0.69,0.22), gold2: rgb(0.95,0.84,0.45), white: rgb(0.96,0.95,0.91), grey: rgb(0.70,0.70,0.72), navy: rgb(0.03,0.04,0.08) };
const W=595.28, H=841.89, cx=W/2;

// tło + winieta
page.drawRectangle({x:0,y:0,width:W,height:H,color:C.bg});
for(let i=0;i<26;i++){ const a=0.012*(26-i)/26; page.drawRectangle({x:0,y:0,width:W,height:H,color:rgb(style.bg[0]+a,style.bg[1]+a,style.bg[2]+a),opacity:0.14*(i/26)}); }
// gwiezdny pył
let seed=42; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
for(let i=0;i<140;i++){ const x=rnd()*W, y=rnd()*H, r=rnd()*0.9+0.2; page.drawCircle({x,y,size:r,color:C.star,opacity:0.10+rnd()*0.25}); }

// potrójna ramka premium
const M=26;
page.drawRectangle({x:M,y:M,width:W-2*M,height:H-2*M,borderColor:C.accent,borderWidth:2.2});
page.drawRectangle({x:M+7,y:M+7,width:W-2*M-14,height:H-2*M-14,borderColor:C.gold,borderWidth:1.1});
page.drawRectangle({x:M+12,y:M+12,width:W-2*M-24,height:H-2*M-24,borderColor:C.accent2,borderWidth:0.5,opacity:0.75});
// narożne ornamenty
const corner=(x,y,sx,sy)=>{ for(let i=0;i<3;i++){ page.drawLine({start:{x:x+sx*(8+i*5),y:y+sy*4},end:{x:x+sx*4,y:y+sy*(8+i*5)},thickness:1.4-i*0.3,color:C.gold}); } };
corner(M+16,M+16,1,1); corner(W-M-16,M+16,-1,1); corner(M+16,H-M-16,1,-1); corner(W-M-16,H-M-16,-1,-1);

let y=H-72;
const center=(t,size,font=F.bold,color=C.white,dy=0,opacity=1)=>{ page.drawText(t,{x:cx-font.widthOfTextAtSize(t,size)/2,y:y+dy,size,font,color,opacity}); };
const line=(x1,y1,x2,y2,w=0.7,color=C.accent)=>page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:w,color});

// nagłówek
center('COSMIC LANDS',34,F.bold,C.gold);
y-=24; center(style.tag,9.5,F.sans,C.accent2,0,0.95);
y-=16; line(cx-130,y,cx+130,y,1.1,C.accent);
y-=30; center('CERTIFICATE OF PLANETARY OWNERSHIP',15,F.bold,C.white);
y-=20; center('Planetary Registry · Rainbow Universe Operating System',8.5,F.it,C.grey);
y-=8;

// grawerowany pas tytułowy planety
y-=26;
page.drawRectangle({x:70,y:y-6,width:W-140,height:34,color:C.accent,opacity:0.16,borderColor:C.accent,borderWidth:0.8});
center(style.name,22,F.bold,C.accent2);

// OWNER
y-=52; center('This certifies that',9,F.rom,C.grey);
y-=26; center(owner,24,F.bold,C.gold2);
y-=24; center('is the recorded proprietor of the following planetary plot',9.5,F.rom,C.white,0,0.9);

// tabela działki (dwie kolumny etykiet)
y-=34;
const rows=[
  ['PLOT ID', plot],
  ['PLANET / REGION', `${style.name} — ${region}`],
  ['CLASS / AREA', `${cls} · ${area}`],
  ['COORDINATES', coords],
  ['COSMO PACKAGE', `${cosmo} COSMO`],
  ['ISSUE PRICE', price],
];
const rowH=23;
const tbTop=y, tbW=W-190, tbX=(W-tbW)/2;
page.drawRectangle({x:tbX,y:tbTop-rowH*rows.length,width:tbW,height:rowH*rows.length,color:rgb(1,1,1),opacity:0.035,borderColor:C.accent,borderWidth:0.6});
rows.forEach(([k,v],i)=>{
  const ry=tbTop-rowH*i;
  if(i>0) line(tbX+8,ry,tbX+tbW-8,ry,0.3,C.accent,);
  page.drawText(k,{x:tbX+16,y:ry-rowH+7.5,size:7.2,font:F.sansB,color:C.accent2,opacity:0.9});
  page.drawText(v,{x:tbX+150,y:ry-rowH+7,size:10.5,font:F.rom,color:C.white});
});

// QR + sekcja numery
y = tbTop-rowH*rows.length-58;
// QR
const qrSize=118, qrX=tbX+26, qrY=y-qrSize+14;
page.drawRectangle({x:qrX-8,y:qrY-8,width:qrSize+16,height:qrSize+16,color:rgb(1,1,1)});
try{
  const m=qrMatrix(mapUrl);
  const cell=qrSize/m.length;
  for(let r=0;r<m.length;r++) for(let c=0;c<m.length;c++){
    if(m[r][c]===1) page.drawRectangle({x:qrX+c*cell,y:qrY+qrSize-(r+1)*cell,width:cell+0.15,height:cell+0.15,color:C.navy});
  }
  page.drawText('SCAN FOR MAP LOCATION',{x:qrX,y:qrY-11,size:5.6,font:F.sansB,color:C.grey});
}catch(e){
  page.drawText('QR ERROR: '+e.message,{x:qrX,y:qrY,size:6,font:F.sans,color:C.grey});
}
// numery po prawej QR-a
const nx=qrX+qrSize+34; let ny=qrY+qrSize-16;
const num=(k,v,small=false)=>{ page.drawText(k,{x:nx,y:ny,size:6.6,font:F.sansB,color:C.accent2,opacity:0.9}); ny-=13; page.drawText(v,{x:nx,y:ny,size:small?8.5:10.5,font:small?F.sans:F.rom,color:C.white}); ny-=17; };
num('CERTIFICATE NUMBER', certNo);
if(tokenId) num('NFT DEED TOKEN ID', `${tokenId} · Base Sepolia 84532`);
if(txHash) num('MINT TRANSACTION', `${txHash.slice(0,14)}…${txHash.slice(-8)}`, true);
num('REGISTRY', 'Cosmic Lands Planetary Registry', true);

// prawny Disclaimer + pieczęć
y=86;
page.drawRectangle({x:tbX,y:52,width:tbW,height:0.7,color:C.accent,opacity:0.5});
page.drawText('This certificate represents an artistic collectible and utility membership within the Cosmic Lands universe. It does not convey real estate, land ownership, or any investment instrument. Issued by Rainbow Universe Operating System · verify at map.cosmiclands.space',{x:tbX+4,y:42,size:6.4,font:F.rom,color:C.grey,maxWidth:tbW-8,lineHeight:8.4});
// holo-seal
const sx=W-tbX-56, sy=64;
page.drawCircle({x:sx,y:sy,size:26,color:C.accent,opacity:0.14});
page.drawCircle({x:sx,y:sy,size:26,borderColor:C.gold,borderWidth:1.1});
page.drawCircle({x:sx,y:sy,size:19,borderColor:C.gold2,borderWidth:0.5,opacity:0.8});
page.drawText('CL',{x:sx-9,y:sy-6,size:14,font:F.bold,color:C.gold});
page.drawText('SEALED',{x:sx-13,y:sy-19,size:4.6,font:F.sansB,color:C.accent2});
// watermark numeru w tle tabeli
page.drawText(certNo,{x:tbX+18,y:tbTop-8,size:30,font:F.bold,color:C.accent,opacity:0.07,rotate:{type:'degrees',angle:18}});

fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out, await pdf.save());
console.log(`✅ ${path.basename(out)} (${style.name} premium, QR → ${mapUrl})`);
