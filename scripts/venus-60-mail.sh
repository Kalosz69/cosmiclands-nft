#!/usr/bin/env bash
# VENUS-60 faza C: wysylka 60 maili z certyfikatami przez SMTP Private Email.
# Env sklada sie z sekretu w runtime (bez echo). MsgId -> build/venus-60-mail.log
set -u
cd /opt/data/workspace/cosmiclands-nft
export SMTP_HOST=mail.privateemail.com
export SMTP_PORT=587
export SMTP_USER=hello@cosmiclands.space
export SMTP_FROM='Cosmic Lands <hello@cosmiclands.space>'
export SMTP_PASS="$(grep -oP '(?<=^haslo: ).*' /opt/data/.secrets/mail/privateemai.txt | head -1)"
[ -n "$SMTP_PASS" ] || { echo "BRAK SMTP_PASS — STOP"; exit 1; }

node - <<'EOF' 2>&1 | tee build/venus-60-mail.log
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const certs = JSON.parse(fs.readFileSync('build/venus-60-certs.json','utf8'));
let sent=0, fail=0;
for(const c of certs){
  try{
    const out = execFileSync('node',['scripts/send-email.mjs','--to',c.email,
      '--plot',c.plot,'--pdf',c.pdf],{stdio:'pipe',env:{...process.env}}).toString();
    const line = out.trim().split('\n').pop();
    if(!line.includes('✅')) throw new Error('brak potwierdzenia: '+line);
    console.log(`${c.plot} -> ${c.email}: ${line.slice(0,110)}`);
    sent++;
  }catch(e){ console.log(`${c.plot}: MAIL FAIL ${String(e).slice(0,120)}`); fail++; }
  fs.writeFileSync('build/venus-60-mail-state.json', JSON.stringify({sent,fail},null,1));
  await new Promise(r=>setTimeout(r,1200)); // anty-throttle SMTP
}
console.log(`\nFAZA C: ${sent} OK / ${fail} FAIL`);
EOF
