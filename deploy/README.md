# Перенос Moooza на новый VPS (с сохранением всех данных)

Переносится **всё**: база данных (пользователи, услуги, посты, отзывы…), загруженные
файлы (`server/uploads`, ~600 МБ) и секреты (`.env`). Приложение поднимается из
того же git-репозитория, на том же коммите.

Что в комплекте:
- `backup.sh` — снимает бэкап на **старом** VPS (БД + uploads + `.env`). Данные не меняет.
- `provision-new-vps.sh` — на **новом** VPS ставит Docker/nginx/certbot, клонирует код,
  восстанавливает данные, поднимает контейнеры и настраивает reverse-proxy + HTTPS.

---

## Шаги

### 0. Подготовка
- Новый VPS: чистый Ubuntu 22.04/24.04 (или Debian), root-доступ.
- Если домен **тот же** (`moooza.ru`): SSL-шаг сработает только после того, как DNS A-запись
  будет указывать на новый сервер. Удобно: сначала запустить с `SKIP_SSL=1`, переключить DNS,
  затем выпустить сертификат.
- Если домен **другой**: после восстановления отредактируй `/opt/mooza/.env` на новом сервере —
  `APP_URL`, `ALLOWED_ORIGINS`, `VITE_API_URL` (и redirect в настройках VK), затем
  `docker compose build web && docker compose up -d web`.

### 1. На СТАРОМ VPS — снять бэкап
```bash
cd /opt/mooza
bash deploy/backup.sh           # → /opt/mooza-backup (db.sql.gz, uploads.tar.gz, .env, COMMIT)
```

### 2. Перенести бэкап на новый VPS
Любой из вариантов:
```bash
# A) напрямую со старого на новый (если со старого есть SSH к новому):
PUSH_TO=root@NEW_IP bash deploy/backup.sh

# B) вручную (через свою машину):
#   со старого: scp -r root@OLD_IP:/opt/mooza-backup ./mooza-backup
#   на новый:   scp -r ./mooza-backup root@NEW_IP:/opt/mooza-backup
```

### 3. На НОВОМ VPS — развернуть
```bash
# код нужен, чтобы запустить скрипт (дальше он сам всё сделает):
git clone https://github.com/cryptoChaosDev/mooza_dev.git /opt/mooza
cd /opt/mooza

DOMAIN=moooza.ru CERTBOT_EMAIL=admin@moooza.ru bash deploy/provision-new-vps.sh
# DNS ещё не переключён? тогда:
# SKIP_SSL=1 DOMAIN=moooza.ru bash deploy/provision-new-vps.sh
# а после переключения DNS:
# certbot --nginx -d moooza.ru -d www.moooza.ru
```

### 4. Проверка
```bash
docker compose ps
curl -s https://moooza.ru/api/health      # {"status":"ok",...}
```
Зайди на сайт — все пользователи, услуги, посты и файлы на месте.

---

## Как это работает (кратко)
- **БД**: `pg_dump … | gzip` на старом → на новом БД восстанавливается из дампа **до** старта API;
  дамп содержит таблицу `_prisma_migrations`, поэтому `prisma migrate deploy` при старте API видит
  все миграции применёнными и ничего не ломает.
- **Файлы**: `server/uploads` пробрасывается в контейнер API bind-mount'ом — распаковка архива на
  хосте сразу подхватывается контейнером.
- **Секреты**: `.env` копируется как есть (JWT, VK, VAPID, SMTP, Telegram, пароль БД).
- **nginx**: пишется server-блок с проксированием `/`, `/api/`, `/uploads/`, `/socket.io/` и map
  `connection_upgrade` для веб-сокетов; HTTPS выпускается `certbot --nginx`.

## Откат
Старый VPS не трогается — если что-то не так на новом, просто вернуть DNS на старый сервер.
