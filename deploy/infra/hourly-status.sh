#!/bin/bash
# Hourly DEV+PROD availability -> Telegram (MOOOZA_LOG). Runs on PROD (B) via cron.
# Reads Telegram creds locally from prod .env (token never leaves the server).
ENV=/opt/mooza/.env
TOKEN=$(grep -E '^TELEGRAM_LOG_TOKEN=' "$ENV" | head -1 | cut -d= -f2-)
CHAT=$(grep -E '^TELEGRAM_LOG_CHAT_ID=' "$ENV" | head -1 | cut -d= -f2-)
BASE=$(grep -E '^TELEGRAM_API_BASE=' "$ENV" | head -1 | cut -d= -f2-)
BASE=${BASE:-https://api.telegram.org}
BASE=${BASE%/}

probe() {
  # full TLS-verified check of the public health endpoint; bad cert / down => 000
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$1/api/health" 2>/dev/null)
  echo "${code:-000}"
}
P=$(probe https://moooza.ru)
D=$(probe https://dev.moooza.ru)

mark() { [ "$1" = "200" ] && printf '\342\234\205' || printf '\342\235\214'; }   # ✅ / ❌
if [ "$P" = "200" ] && [ "$D" = "200" ]; then HEAD=$(printf '\360\237\237\242 \320\241\321\202\320\260\321\202\321\203\321\201'); else HEAD=$(printf '\360\237\224\264 \320\241\321\202\320\260\321\202\321\203\321\201'); fi
TS=$(TZ=Europe/Moscow date '+%d.%m %H:%M MSK')
MSG=$(printf '%s (%s)\nPROD moooza.ru: %s %s\nDEV dev.moooza.ru: %s %s' "$HEAD" "$TS" "$P" "$(mark "$P")" "$D" "$(mark "$D")")

curl -sS --max-time 15 "$BASE/bot$TOKEN/sendMessage" \
  --data-urlencode "chat_id=$CHAT" \
  --data-urlencode "text=$MSG" \
  -o /dev/null -w 'sent http=%{http_code}\n'
