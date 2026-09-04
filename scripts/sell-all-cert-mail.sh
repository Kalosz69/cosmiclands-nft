#!/usr/bin/env bash
# sell-all: generuj 44 premium certyfikaty i wyślij maile (partie, odstępy anty-throttle)
set -euo pipefail
cd /opt/data/workspace/cosmiclands-nft
PASS="$(grep -A1 'hello@cosmiclands.space' /opt/data/.secrets/mail/privateemai.txt | grep -oE 'haslo: .*' | cut -d' ' -f2)"
export SMTP_HOST=mail.privateemail.com SMTP_PORT=465 SMTP_SECURE=true
export SMTP_USER=hello@cosmiclands.space SMTP_PASS="$PASS"
node scripts/sell-all-cert-mail.mjs
