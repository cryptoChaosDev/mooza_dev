#!/bin/bash
# Moooza PROD backup: pg_dump (gzip, versioned) + uploads mirror, pushed OFFSITE to A (dev host).
# Runs on PROD (B) via systemd timer. Notifies MOOOZA_LOG via the tg relay.
set -o pipefail
A=81.31.246.105
KEY=/root/.ssh/id_ed25519_bkp
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes"
LOCDIR=/root/backups/db
mkdir -p "$LOCDIR"
TS=$(TZ=Europe/Moscow date '+%Y%m%d_%H%M')
DUMP="$LOCDIR/mooza_db_$TS.sql.gz"

# 1) DB dump
if docker exec mooza-postgres pg_dump -U mooza -d mooza_db 2>/dev/null | gzip > "$DUMP" && [ -s "$DUMP" ]; then
  DBOK=1; DBSZ=$(du -h "$DUMP" | cut -f1)
else
  DBOK=0; rm -f "$DUMP"; DBSZ="—"
fi

# 2) push DB dumps offsite -> A
$SSH root@$A "mkdir -p /root/prod_backups/db /root/prod_backups/uploads" 2>/dev/null
if rsync -a -e "$SSH" "$LOCDIR"/ root@$A:/root/prod_backups/db/ 2>/dev/null; then OFF_DB=ok; else OFF_DB=FAIL; fi

# 3) mirror uploads offsite -> A (incremental)
if rsync -a --delete -e "$SSH" /opt/mooza/server/uploads/ root@$A:/root/prod_backups/uploads/ 2>/dev/null; then OFF_UP=ok; else OFF_UP=FAIL; fi
UPSZ=$($SSH root@$A "du -sh /root/prod_backups/uploads 2>/dev/null | cut -f1" 2>/dev/null)

# 4) retention: 14 days of DB dumps (local + offsite)
find "$LOCDIR" -name '*.sql.gz' -mtime +14 -delete 2>/dev/null
$SSH root@$A "find /root/prod_backups/db -name '*.sql.gz' -mtime +14 -delete" 2>/dev/null
NLOC=$(ls -1 "$LOCDIR"/*.sql.gz 2>/dev/null | wc -l | tr -d ' ')

# 5) notify MOOOZA_LOG via relay
ENV=/opt/mooza/.env
TOKEN=$(grep -E '^TELEGRAM_LOG_TOKEN=' "$ENV" | head -1 | cut -d= -f2-)
CHAT=$(grep -E '^TELEGRAM_LOG_CHAT_ID=' "$ENV" | head -1 | cut -d= -f2-)
BASE=$(grep -E '^TELEGRAM_API_BASE=' "$ENV" | head -1 | cut -d= -f2-); BASE=${BASE:-https://api.telegram.org}; BASE=${BASE%/}
if [ "$DBOK" = 1 ] && [ "$OFF_DB" = ok ] && [ "$OFF_UP" = ok ]; then
  HEAD=$(printf '\360\237\222\276 \320\221\321\215\320\272\320\260\320\277 OK')      # 💾 Бэкап OK
else
  HEAD=$(printf '\342\232\240\357\270\217 \320\221\321\215\320\272\320\260\320\277 \321\201 \320\276\321\210\320\270\320\261\320\272\320\276\320\271')  # ⚠️ Бэкап с ошибкой
fi
DBST=$([ "$DBOK" = 1 ] && echo ok || echo FAIL)
MSG=$(printf '%s (%s)\nБД: %s (%s) · офсайт→A: %s\nUploads→A: %s (%s)\nДампов локально: %s (ретеншен 14д)' \
  "$HEAD" "$(TZ=Europe/Moscow date '+%d.%m %H:%M')" "$DBSZ" "$DBST" "$OFF_DB" "$OFF_UP" "${UPSZ:-—}" "$NLOC")
curl -sS --max-time 20 "$BASE/bot$TOKEN/sendMessage" --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$MSG" -o /dev/null -w 'notify http=%{http_code}\n'
echo "backup done: DB=$DBST off_db=$OFF_DB off_up=$OFF_UP uploads=$UPSZ dumps=$NLOC"
