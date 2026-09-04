// Weryfikacja manifestu Marsa: komercyjne = reduced (80/240/720/2160), genesis = pełne (100/300/900/2700)
import fs from 'node:fs';
const m = JSON.parse(fs.readFileSync('/opt/data/workspace/cosmiclands-nft/mars-manifest.json', 'utf8'));
const plots = Array.isArray(m) ? m : (m.plots || m.manifest || []);
console.log('liczba działek:', plots.length);

const klasa = p => (String(p.klasa || p.class || p.size || p.typ || p.title || '').match(/S|M|L|XL/) || [''])[0];
const REDUCED = { S: 80, M: 240, L: 720, XL: 2160 };
const PELNE = { S: 100, M: 300, L: 900, XL: 2700 };
let g = 0, k = 0, gp = 0, kp = 0, kom = {}, gen = {};

for (const p of plots) {
  const s = JSON.stringify(p);
  const isGen = /genesis|rezerwat|reserve|nature/i.test(s.slice(0, 300));
  const kk = klasa(p);
  if (isGen) { g++; gp += PELNE[kk] || 0; gen[kk] = (gen[kk] || 0) + 1; }
  else { k++; kp += REDUCED[kk] || 0; kom[kk] = (kom[kk] || 0) + 1; }
}
console.log('komercyjne:', k, 'COSMO (reduced):', kp, JSON.stringify(kom));
console.log('genesis:', g, 'COSMO (pełne):', gp, JSON.stringify(gen));
console.log('RAZEM:', kp + gp, '(oczekiwane 4 868 000)');
console.log('Kontrola: 3 708 000 + 1 160 000 =', 3708000 + 1160000);
console.log('Rozkład idealny vs manifest: S', 3200 - kom.S, 'M', 2400 - kom.M, 'L', 1600 - kom.L, 'XL', 800 - kom.XL);
