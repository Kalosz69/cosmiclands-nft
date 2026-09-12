#!/bin/bash
# boot-restore-cl-poller.sh v1 (2026-09-12, GO K "od razu naprawiamy i dopinamy")
# Cel: odtworzenie definicji s6 service cl-poller po restarcie KONTENERA pmkb
#      (/run = tmpfs → definicja i symlinki giną; s6-svscan PID1 nie wie o cl-poller).
# Mechanizm: recreate /run/service/cl-poller/{run,finish,log/run,type} + notify s6-svscan.
# Uruchamiać jako ROOT na hoście (docker exec -u root …) lub z boot-start kontenera.
# Bezpiecznie idempotentny: jeśli service żyje → exit 0 bez zmian.
set -u
SVC=/run/service/cl-poller
RUN_FILE=/run/service/cl-poller/run

# 0) Już żywy? (proces node poller.mjs istnieje → nic nie rób)
if pgrep -f "node poller.mjs" >/dev/null 2>&1; then
  echo "POLLER_ALREADY_UP $(date -u +%FT%TZ)"
  exit 0
fi

# 1) Definicja istnieje? (tmpfs: znika po restarcie kontenera)
if [ -f "$RUN_FILE" ]; then
  echo "SVC_DEFINED $(date -u +%FT%TZ)"
else
  echo "RECREATE $(date -u +%FT%TZ)"
  mkdir -p "$SVC/log"
  cat > "$RUN_FILE" <<'EOF'
#!/command/with-contenv sh
# Cosmic Lands post-purchase orchestrator (poller.mjs) — s6 longrun.
export HOME=/opt/data
cd /opt/data/workspace/cosmiclands-nft/orchestrator
exec node poller.mjs
EOF
  cat > "$SVC/finish" <<'EOF'
#!/command/with-contenv sh
exit 0
EOF
  cat > "$SVC/type" <<'EOF'
longrun
EOF
  cat > "$SVC/log/run" <<'EOF'
#!/command/with-contenv sh
log_dir=/opt/data/logs/cl-poller
mkdir -p "$log_dir"
exec s6-log n10 s10485760 "$log_dir"
EOF
  chmod +x "$RUN_FILE" "$SVC/finish" "$SVC/log/run"
fi

# 2) Powiadom s6-svscan o nowym katalogu (tylko root to zrobi)
if [ -w "$SVC/event" ] 2>/dev/null || [ "$(id -u)" = "0" ]; then
  /command/s6-svscanctl -a /run/service 2>/dev/null || \
    s6-svscanctl -a /run/service 2>/dev/null || true
  sleep 3
fi

# 3) Weryfikacja
sleep 5
if pgrep -f "node poller.mjs" >/dev/null 2>&1; then
  echo "POLLER_UP $(date -u +%FT%TZ) pid=$(pgrep -f 'node poller.mjs' | head -1)"
  exit 0
fi
echo "POLLER_NOT_STARTED — sprawdź /run/service/cl-poller i log /opt/data/logs/cl-poller/current"
exit 1