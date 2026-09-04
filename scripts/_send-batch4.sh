#!/usr/bin/env bash
# Wysyłka 4 premium certyfikatów (batch4) do jarek.galosz@gmail.com
set -euo pipefail
cd /opt/data/workspace/cosmiclands-nft
PASS="$(grep -A1 'hello@cosmiclands.space' /opt/data/.secrets/mail/privateemai.txt | grep -oE 'haslo: .*' | cut -d' ' -f2)"
export SMTP_HOST=mail.privateemail.com SMTP_PORT=465 SMTP_SECURE=true
export SMTP_USER=hello@cosmiclands.space SMTP_PASS="$PASS"
for plot in MARS-PLOT-000555 MARS-PLOT-001048 MARS-PLOT-001479 MARS-PLOT-001849; do
  node scripts/send-email.mjs --to jarek.galosz@gmail.com --plot "$plot" --pdf "test-output/${plot}-premium.pdf" 2>&1 | tail -1
done
