#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Moooza — provision a NEW VPS and restore the app with all data.
# Run this ON THE NEW (fresh Ubuntu/Debian) VPS, as root, AFTER the backup
# bundle from deploy/backup.sh has been copied to $BUNDLE_DIR (default
# /opt/mooza-backup).
#
# Prerequisite: point the domain's DNS A record at THIS server BEFORE running
# (the SSL step needs the domain to resolve here).
#
#   DOMAIN=moooza.ru CERTBOT_EMAIL=admin@moooza.ru bash deploy/provision-new-vps.sh
#
# Env vars (all optional except where noted):
#   DOMAIN          public domain (default moooza.ru)
#   CERTBOT_EMAIL   email for Let's Encrypt (default admin@<DOMAIN>)
#   REPO_URL        git repo (default the public Moooza repo)
#   APP_DIR         install dir (default /opt/mooza)
#   BUNDLE_DIR      where db.sql.gz/uploads.tar.gz/.env live (default /opt/mooza-backup)
#   SKIP_SSL=1      skip certbot (e.g. DNS not ready yet — run certbot later)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${DOMAIN:-moooza.ru}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@${DOMAIN}}"
REPO_URL="${REPO_URL:-https://github.com/cryptoChaosDev/mooza_dev.git}"
APP_DIR="${APP_DIR:-/opt/mooza}"
BUNDLE_DIR="${BUNDLE_DIR:-/opt/mooza-backup}"

echo "==> Moooza provision: domain=$DOMAIN  app=$APP_DIR  bundle=$BUNDLE_DIR"
[ -f "$BUNDLE_DIR/db.sql.gz" ] || { echo "ERROR: $BUNDLE_DIR/db.sql.gz missing — copy the backup bundle here first"; exit 1; }
[ -f "$BUNDLE_DIR/.env" ]      || { echo "ERROR: $BUNDLE_DIR/.env missing"; exit 1; }

# ── 1. System packages ───────────────────────────────────────────────────────
echo "[1/7] Installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git nginx rsync

echo "[2/7] Installing Docker + compose plugin..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# ── 2. Code ──────────────────────────────────────────────────────────────────
echo "[3/7] Fetching application code..."
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all -q
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
if [ -f "$BUNDLE_DIR/COMMIT" ]; then
  git checkout -q "$(cat "$BUNDLE_DIR/COMMIT")" || git pull -q
else
  git pull -q
fi

# ── 3. Restore secrets + uploads ─────────────────────────────────────────────
echo "[4/7] Restoring .env and uploads..."
cp "$BUNDLE_DIR/.env" "$APP_DIR/.env"
mkdir -p "$APP_DIR/server"
if [ -s "$BUNDLE_DIR/uploads.tar.gz" ]; then
  tar -C "$APP_DIR/server" -xzf "$BUNDLE_DIR/uploads.tar.gz"
fi

set -a; . "$APP_DIR/.env"; set +a
POSTGRES_USER="${POSTGRES_USER:-mooza}"
POSTGRES_DB="${POSTGRES_DB:-mooza_db}"

# ── 4. Database: start Postgres, restore the dump BEFORE the API migrates ─────
echo "[5/7] Starting Postgres and restoring the database..."
docker compose up -d postgres
echo "  waiting for Postgres to accept connections..."
for i in $(seq 1 60); do
  if docker exec mooza-postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then break; fi
  sleep 2
done
gunzip -c "$BUNDLE_DIR/db.sql.gz" | docker exec -i mooza-postgres psql -v ON_ERROR_STOP=0 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null
echo "  database restored ($(docker exec mooza-postgres psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT count(*) FROM "User";' 2>/dev/null || echo '?') users)."

# ── 5. Build + start API and Web (api startup runs prisma migrate deploy) ─────
echo "[6/7] Building and starting api + web..."
docker compose build api web
docker compose up -d api web

# ── 6. Nginx reverse proxy + TLS ─────────────────────────────────────────────
echo "[7/7] Configuring nginx + TLS for $DOMAIN..."
# WebSocket upgrade map (http context) — idempotent.
cat > /etc/nginx/conf.d/moooza-upgrade-map.conf <<'MAP'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
MAP

cat > "/etc/nginx/sites-available/${DOMAIN}" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    client_max_body_size 20M;

    location /api/      { proxy_pass http://localhost:4000; include /etc/nginx/moooza-proxy.conf; }
    location /uploads/  { proxy_pass http://localhost:4000; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; }
    location /socket.io/ { proxy_pass http://localhost:4000; include /etc/nginx/moooza-proxy.conf; proxy_send_timeout 86400; }
    location /          { proxy_pass http://localhost:3000; include /etc/nginx/moooza-proxy.conf; }
}
NGINX

cat > /etc/nginx/moooza-proxy.conf <<'PROXY'
proxy_http_version 1.1;
proxy_set_header   Upgrade $http_upgrade;
proxy_set_header   Connection $connection_upgrade;
proxy_set_header   Host $host;
proxy_set_header   X-Real-IP $remote_addr;
proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header   X-Forwarded-Proto $scheme;
proxy_read_timeout 86400;
PROXY

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t && systemctl reload nginx

if [ "${SKIP_SSL:-0}" != "1" ]; then
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" --redirect \
    || echo "  ! certbot failed (DNS not pointing here yet?). Re-run: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
fi

echo
echo "==> Done."
docker compose ps
echo "==> Check: curl -s https://${DOMAIN}/api/health"
