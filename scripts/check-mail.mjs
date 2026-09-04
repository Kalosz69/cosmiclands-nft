#!/usr/bin/env node
/**
 * check-mail.mjs — sprawdzanie skrzynki (IMAP Private Email) przez IMAP.
 * Czyta dane logowania z /opt/data/.secrets/mail/privateemai.txt (linia 1 = user, linia "haslo: X" = hasło).
 * Użycie: node scripts/check-mail.mjs [--folder INBOX|Sent|Spam] [--last N] [--attachments]
 * Domyślnie: INBOX, ostatnie 10, bez załączników.
 * Sekrety NIGDY nie są wypisywane.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const folder = getArg('--folder', 'INBOX');
const last = parseInt(getArg('--last', '10'), 10);
const withAtt = args.includes('--attachments');

const secretsPath = process.env.MAIL_SECRETS || '/opt/data/.secrets/mail/privateemai.txt';
const lines = fs.readFileSync(secretsPath, 'utf8').trim().split(/\r?\n/);
const user = lines[0].trim();
const passLine = lines.find((l) => l.toLowerCase().startsWith('haslo'));
if (!passLine) { console.error('Brak linii "haslo:" w', secretsPath); process.exit(1); }
const pass = passLine.split(':').slice(1).join(':').trim();

const client = new ImapFlow({
  host: process.env.IMAP_HOST || 'mail.privateemail.com',
  port: parseInt(process.env.IMAP_PORT || '993', 10),
  secure: true,
  auth: { user, pass },
  logger: false,
});

try {
  await client.connect();
  const lock = await client.getMailboxLock(folder);
  try {
    const status = await client.status(folder, { messages: true });
    console.log(`📬 ${folder}: ${status.messages} wiadomości (IMAP ${user})`);
    const total = status.messages;
    if (total === 0) { console.log('   (pusto)'); process.exit(0); }
    const from = Math.max(1, total - last + 1);
    let seen = 0;
    for await (const msg of client.fetch(`${from}:*`, { envelope: true, uid: true, bodyStructure: true })) {
      seen++;
      const env = msg.envelope;
      const fromAddr = env.from?.[0] ? `${env.from[0].name || ''} <${env.from[0].address}>` : '?';
      const toAddr = env.to?.[0] ? `${env.to[0].name || ''} <${env.to[0].address}>` : '?';
      const date = env.date ? env.date.toISOString().replace('T', ' ').slice(0, 16) : '?';
      const atts = (msg.bodyStructure?.childNodes || [])
        .filter((n) => n.disposition === 'attachment' || n.disposition === 'inline')
        .map((n) => `${n.parameters?.name || n.dispositionParameters?.filename || '?'} (${n.size || '?'}B)`);
      console.log(`  • ${date} | ${env.subject?.slice(0, 60) || '(brak tematu)'}`);
      console.log(`    from: ${fromAddr.slice(0, 70)}`);
      console.log(`    to:   ${toAddr.slice(0, 70)}`);
      if (withAtt && atts.length) console.log(`    att:  ${atts.join(', ')}`);
    }
  } finally { lock.release(); }
  await client.logout();
} catch (e) {
  console.error(`❌ IMAP: ${e.message}`);
  process.exit(1);
}
