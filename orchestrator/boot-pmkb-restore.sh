#!/bin/bash
# boot-pmkb-restore.sh — jeden skrypt na start kontenera pmkb (docker restart / reboot hosta).
# Odtwarza wszystko, co żyje w /run (tmpfs) i ginie przy restarcie kontenera.
# Uruchamiać jako ROOT: docker exec -u root 85d011e88dc2 bash /opt/data/workspace/cosmiclands-nft/orchestrator/boot-pmkb-restore.sh
# Albo podpiąć do /etc/s6-overlay/scripts (jeśli K doda ENTRYPOINT hook) / na hosta do crontab @reboot.
set -u
echo "── boot-pmkb-restore $(date -u +%FT%TZ) ──"

# 1) cl-poller (definicja s6 + start)
bash /opt/data/workspace/cosmiclands-nft/orchestrator/boot-restore-cl-poller.sh
r1=$?
echo "cl-poller: exit=$r1"

# 2) TODO (boot-restore): gateway-cosmic-lands (martwy slot), cron definicje w /opt/data/cron —
#    jobs.json żyje w /opt/data (persistent), tylko /run części do odtworzenia. Dodać w miarę potrzeb.

echo "── done ──"
exit $r1