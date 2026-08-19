#!/usr/bin/env node
/**
 * send-email.mjs — wysyłka e-maili (Resend) z PDF certyfikatu.
 * Użycie: RESEND_API_KEY=re_... node scripts/send-email.mjs --to k@x.pl --plot MARS-PLOT-000042 --pdf test-output/MARS-PLOT-000042.pdf
 * Bez RESEND_API_KEY → tryb demo (loguje, nie wysyła).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const to = getArg('--to', 'test@example.com');
const plot = getArg('--plot', 'MARS-PLOT-000042');
const pdfPath = getArg('--pdf', path.join(__dirname, '..', 'test-output', `${plot}.pdf`));
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM || 'Cosmic Lands <hello@cosmiclands.space>';

if (!fs.existsSync(pdfPath)) { console.error(`Brak PDF: ${pdfPath}`); process.exit(1); }
const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

if (!apiKey) {
  console.log(`🔸 DEMO (brak RESEND_API_KEY) — wysyłka ${to}, plot ${plot}, pdf ${pdfPath}, ${pdfBase64.length} B`);
  process.exit(0);
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from,
    to,
    subject: `Your Cosmic Lands Deed — ${plot}`,
    html: `<h2>Congrats! You own ${plot}.</h2><p>Certificate attached. NFT deed: minted on Base (see tx in your profile).</p>`,
    attachments: [{ filename: `${plot}-certificate.pdf`, content: pdfBase64 }],
  }),
});
const txt = await res.text();
if (!res.ok) { console.error(`❌ Resend ${res.status}: ${txt}`); process.exit(1); }
console.log(`✅ Wysłano do ${to} — ${txt}`);