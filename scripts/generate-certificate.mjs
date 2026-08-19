#!/usr/bin/env node
/**
 * generate-certificate.mjs — PDF certyfikatu właścicielstwa (pdf-lib, lokalny test).
 * A4, dane działki, miejsce na QR/podpis. Bez zewnętrznych zależności.
 *
 * Użycie: node scripts/generate-certificate.mjs [--plot ID] [--owner NAME] [--out path]
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};

const plot = getArg('--plot', 'MARS-PLOT-000042');
const outPath = getArg('--out', path.join(__dirname, '..', 'test-output', `${plot}.pdf`));
const owner = getArg('--owner', 'Jarek G.');
const cls = getArg('--class', 'XL');
const region = getArg('--region', 'Acidalia');
const planet = getArg('--planet', 'Mars');
const area = getArg('--area', '13.5 ha');
const price = getArg('--price', '999 EUR');
const coords = getArg('--coords', '76.5, -36.5');
const certNo = getArg('--cert', `COSMO-2026-${String(100000 + Math.floor(Math.random() * 90000))}`);

const pdf = await PDFDocument.create();
const page = pdf.addPage([595.28, 841.89]); // A4 portrait
const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
const fontN = await pdf.embedFont(StandardFonts.Helvetica);
const gold = rgb(0.83, 0.69, 0.22);
const navy = rgb(0.05, 0.09, 0.20);
const white = rgb(0.95, 0.95, 0.95);
const grey = rgb(0.72, 0.72, 0.72);

// tło
page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: navy });
// złota ramka + wewnętrzna
page.drawRectangle({ x: 28, y: 28, width: 539, height: 786, color: gold });
page.drawRectangle({ x: 36, y: 36, width: 523, height: 770, color: navy });

const center = 595 / 2;
let y = 770;
const centerText = (text, size, font = fontB, color = gold, dy = 0) => {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: center - w / 2, y: y + dy, size, font, color });
};

centerText('COSMIC LANDS', 30, fontB, gold);
y -= 42;
centerText('CERTIFICATE OF OWNERSHIP', 20, fontB, white);
y -= 26;
centerText('Issued by Rainbow Universe Operating System', 9, fontN, grey);
y -= 14;
centerText('Cosmic Lands Planetary Registry', 9, fontN, grey);
y -= 42;
centerText('This certifies that', 11, fontN, grey);
y -= 24;
centerText(owner, 20, fontB, gold);
y -= 26;
centerText('is the verified owner of the following planetary plot:', 11, fontN, grey);
y -= 46;

const rows = [
  ['PLOT ID', plot],
  ['PLANET / REGION', `${planet} — ${region}`],
  ['CLASS / AREA', `${cls} / ${area}`],
  ['COORDINATES', coords],
  ['PRICE PAID', price],
  ['DATE', new Date().toISOString().slice(0, 10)],
];
for (const [k, v] of rows) {
  page.drawText(k, { x: 90, y, size: 11, font: fontB, color: gold });
  page.drawText(v, { x: 300, y, size: 11, font: fontN, color: white });
  page.drawLine({ start: { x: 90, y: y - 6 }, end: { x: 505, y: y - 6 }, thickness: 0.5, color: rgb(0.5, 0.44, 0.18) });
  y -= 38;
}

y -= 18;
centerText('Certificate number: ' + certNo, 10, fontN, grey, 0);
y -= 60;
// ramka QR placeholder
page.drawRectangle({ x: 90, y: 120, width: 70, height: 70, borderColor: gold, borderWidth: 1, color: navy });
page.drawText('QR', { x: 118, y: 150, size: 10, font: fontN, color: gold });
page.drawText('VERIFY: cosmiclands.space/verify', { x: 175, y: 150, size: 9, font: fontN, color: grey });
// podpis
page.drawText('Signature', { x: 360, y: 150, size: 9, font: fontN, color: grey });
page.drawLine({ start: { x: 360, y: 138 }, end: { x: 500, y: 138 }, thickness: 0.7, color: gold });
page.drawText('Not a real estate deed — artistic collectible', { x: 90, y: 68, size: 8, font: fontN, color: grey });

const bytes = await pdf.save();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bytes);
console.log(`✅ PDF: ${outPath} (${bytes.length} B)`);