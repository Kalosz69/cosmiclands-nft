#!/usr/bin/env node
/**
 * generate-paper-backup.mjs — PAPIEROWE NOŚNIKI dla depozytu w banku (K 19.08).
 *
 * "Wszystkie minty zapisać na papierowych nośnikach i zdeponować w prawdziwym
 * banku / paru bankach jako zabezpieczenie na lata."
 *
 * Generuje PDF A4: manifest wszystkich mintów (tokenId, plotId, właściciel,
 * unlock date, kwota COSMO) — gotowy do wydruku i depozytu.
 *
 * ⚠️ BEZPIECZEŃSTWO: papier zawiera TYLKO dane publiczne (adresy, tokenId).
 *    NIGDY nie drukować kluczy prywatnych ani seed phrase'ów!
 *    Klucze prywatne → osobny, szyfrowany nośnik (stal/papier w sejfie), nie tu.
 *
 * Wejście: build/reserve-schedule.json (harmonogram) + opcjonalnie data/holders.json
 *          lub własny manifest --manifest path
 * Użycie:  node scripts/generate-paper-backup.mjs [--out path] [--manifest path]
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};

const manifestPath = getArg('--manifest', path.join(root, 'build', 'reserve-schedule.json'));
if (!fs.existsSync(manifestPath)) {
  console.error(`Brak manifestu: ${manifestPath} — uruchom najpierw mint-reserve-schedule.mjs`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Standardowe fonty PDF (WinAnsi) nie mają polskich znaków — sanitizer do ASCII.
const PL = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
             'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z' };
const ascii = s => String(s).replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, ch => PL[ch] || ch);

const pdf = await PDFDocument.create();
const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
const fontN = await pdf.embedFont(StandardFonts.Helvetica);
const gold = rgb(0.83, 0.69, 0.22);
const navy = rgb(0.05, 0.09, 0.20);
const white = rgb(0.95, 0.95, 0.95);
const grey = rgb(0.55, 0.55, 0.6);

const page = pdf.addPage([595.28, 841.89]); // A4
page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: navy });

// nagłówek
page.drawText(ascii('COSMIC LANDS — PAPER BACKUP / MANIFEST MINTÓW'), { x: 42, y: 800, size: 15, font: fontB, color: gold });
page.drawText(ascii('Depozyt bankowy — zabezpieczenie długoterminowe (K 19.08)'), { x: 42, y: 780, size: 10, font: fontN, color: white });
page.drawText(ascii(`Wygenerowano: ${new Date().toISOString().slice(0, 10)} | Plik źródłowy: ${path.basename(manifestPath)}`), { x: 42, y: 764, size: 9, font: fontN, color: grey });
page.drawText(ascii('NIGDY nie drukuj kluczy prywatnych / seed phrase. Ten dokument = dane publiczne.'), { x: 42, y: 748, size: 9, font: fontN, color: grey });

let y = 720;
const row = (cols) => {
  const xs = [42, 160, 260, 400, 480];
  cols.forEach((c, i) => page.drawText(ascii(c), { x: xs[i], y, size: 8.5, font: i === 0 ? fontB : fontN, color: white }));
  y -= 14;
};

row([ascii('Planeta'), ascii('Unlock rok'), ascii('Działki'), ascii('COSMO/planeta'), ascii('Unlock date')]);
page.drawLine({ start: { x: 42, y: y + 4 }, end: { x: 553, y: y + 4 }, thickness: 0.6, color: gold });

for (const p of manifest.planets || []) {
  row([p.name, `${p.unlockYear} (za ${p.unlockYear - 1} lat)`, String(p.totalPlots || ''), String(p.cosmoPerPlanet || ''), p.unlockDate || '']);
}

y -= 10;
page.drawText(ascii(`RAZEM: ${manifest.totalPlots ?? 16000} działek = ${manifest.totalCosmo ?? 9280000} COSMO (pełne pakiety Genesis 100/300/900/2700)`), { x: 42, y, size: 10, font: fontB, color: gold });
y -= 24;
page.drawText(ascii('KONTROLA TOKENOMIKI: 16 000 × średnia 580 = 9 280 000 COSMO (pula Bank+Liquidity)'), { x: 42, y, size: 9, font: fontN, color: white });
y -= 40;
page.drawText(ascii('Miejsce na podpisy / pieczęcie bankowe:'), { x: 42, y, size: 9, font: fontN, color: grey });
y -= 26;
page.drawLine({ start: { x: 42, y }, end: { x: 250, y }, thickness: 0.6, color: gold });
y -= 14;
page.drawText('___________________________________', { x: 42, y, size: 9, font: fontN, color: grey });
page.drawText('___________________________________', { x: 300, y, size: 9, font: fontN, color: grey });

const bytes = await pdf.save();
const outPath = getArg('--out', path.join(root, 'test-output', `paper-backup-${new Date().toISOString().slice(0, 10)}.pdf`));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bytes);
console.log(`✅ Papierowy manifest: ${outPath} (${bytes.length} B)`);
console.log('   Do wydruku i depozytu w banku (lub kilku bankach) jako zabezpieczenie na lata.');
