#!/usr/bin/env node
/**
 * send-email.mjs — wysyłka e-maili z PDF certyfikatu.
 * Priorytet: RESEND_API_KEY (API Resend) → SMTP (Private Email / dowolny, env SMTP_*).
 * Użycie Resend: RESEND_API_KEY=re_... node scripts/send-email.mjs --to k@x.pl --plot MARS-PLOT-000042 --pdf test-output/MARS-PLOT-000042.pdf
 * Użycie SMTP:    SMTP_HOST=... SMTP_USER=... SMTP_PASS=... node scripts/send-email.mjs --to k@x.pl --plot ... --pdf ...
 * Bez obu → tryb demo (loguje, nie wysyła).
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
const bank = args.includes('--bank');
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM || 'Cosmic Lands <hello@cosmiclands.space>';

// Cosmic Bank notice (K 01.09): klient nie podał portfela → NFT+COSMO czekają w banku
const BANK_NOTE = `<p><strong>Your NFT Deed and COSMO are waiting for you in the Cosmic Bank.</strong> Claim them now in the Claim portal: <a href="https://cosmiclands.space/claim">cosmiclands.space/claim</a></p>`;

if (!fs.existsSync(pdfPath)) { console.error(`Brak PDF: ${pdfPath}`); process.exit(1); }
const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
const pdfBuf = Buffer.from(pdfBase64, 'base64');

// --- 1) Resend ---
if (apiKey) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: `Your Cosmic Lands Deed — ${plot}`,
      html: `<h2>Congrats! You own ${plot}.</h2><p>Certificate attached. NFT deed: minted on Base (see tx in your profile).</p>${bank ? BANK_NOTE : ''}`,
      attachments: [{ filename: `${plot}-certificate.pdf`, content: pdfBase64 }],
    }),
  });
  const txt = await res.text();
  if (!res.ok) { console.error(`❌ Resend ${res.status}: ${txt}`); process.exit(1); }
  console.log(`✅ Wysłano (Resend) do ${to} — ${txt}`);
  process.exit(0);
}

// --- 2) SMTP (fallback) ---
const smtp = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  requireTLS: true, // Private Email (Namecheap) wymaga STARTTLS przed AUTH
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  from: process.env.SMTP_FROM || from,
};
if (smtp.host && smtp.auth.user && smtp.auth.pass) {
  const nodemailer = await import('nodemailer');
  const subject = `Your Cosmic Lands Deed — ${plot}`;
  const html = `<h2>Congrats! You own ${plot}.</h2><p>Certificate attached. NFT deed: minted on Base (see tx in your profile).</p>${bank ? BANK_NOTE : ''}`;
  const info = await nodemailer.createTransport(smtp).sendMail({
    from: smtp.from, to,
    subject,
    html,
    attachments: [{ filename: `${plot}-certificate.pdf`, content: pdfBuf }],
  });
  console.log(`✅ Wysłano (SMTP ${smtp.host}:${smtp.port}) do ${to} — msgId ${info.messageId}`);
  process.exit(0);
}

// --- 3) Demo ---
console.log(`🔸 DEMO (brak RESEND_API_KEY i SMTP_*) — wysyłka ${to}, plot ${plot}, pdf ${pdfPath}, ${pdfBase64.length} B`);
process.exit(0);