#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Moooza — backup the running stack into a portable bundle.
# Run this ON THE CURRENT (OLD) VPS. It dumps the Postgres DB, archives the
# uploaded files and copies the secrets (.env), so everything can be restored
# 1:1 on a new server. No data is modified.
#
#   bash deploy/backup.sh                 # bundle → /opt/mooza-backup
#   OUT=/tmp/mb bash deploy/backup.sh     # custom output dir
#
# Optional: push the bundle straight to the new VPS afterwards:
#   PUSH_TO=root@NEW_IP bash deploy/backup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mooza}"
OUT="${OUT:-/opt/mooza-backup}"
PG_CONTAINER="${PG_CONTAINER:-mooza-postgres}"

[ -f "$APP_DIR/.env" ] || { echo "ERROR: $APP_DIR/.env not found"; exit 1; }
# Load DB credentials from the app's .env (with sane fallbacks).
set -a; . "$APP_DIR/.env"; set +a
POSTGRES_USER="${POSTGRES_USER:-mooza}"
POSTGRES_DB="${POSTGRES_DB:-mooza_db}"

mkdir -p "$OUT"
echo "==> Backup bundle: $OUT"

echo "[1/4] Dumping Postgres ($POSTGRES_DB as $POSTGRES_USER)..."
docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-privileges --clean --if-exists | gzip > "$OUT/db.sql.gz"

echo "[2/4] Archiving uploads ($APP_DIR/server/uploads)..."
if [ -d "$APP_DIR/server/uploads" ]; then
  tar -C "$APP_DIR/server" -czf "$OUT/uploads.tar.gz" uploads
else
  echo "  (no uploads dir — skipping)"; : > "$OUT/uploads.tar.gz"
fi

echo "[3/4] Copying secrets (.env)..."
cp "$APP_DIR/.env" "$OUT/.env"

echo "[4/4] Copying nginx site config for reference..."
cp /etc/nginx/sites-available/moooza.ru "$OUT/nginx-site.conf" 2>/dev/null \
  || cp /etc/nginx/sites-enabled/moooza.ru "$OUT/nginx-site.conf" 2>/dev/null \
  || echo "  (host nginx config not found — provision script writes a fresh one)"

# Record the exact commit so the new VPS checks out the same code.
( cd "$APP_DIR" && git rev-parse HEAD 2>/dev/null > "$OUT/COMMIT" ) || true

echo
echo "==> Done. Bundle contents:"
ls -lh "$OUT"

if [ -n "${PUSH_TO:-}" ]; then
  echo
  echo "==> Pushing bundle to $PUSH_TO:$OUT ..."
  ssh "$PUSH_TO" "mkdir -p '$OUT'"
  rsync -avz --progress "$OUT/" "$PUSH_TO:$OUT/"
  echo "==> Pushed. Now run the provision script on the new VPS."
fi
