# Своп серверов PROD ↔ DEV — выполнено 2026-07-04

Поменяли местами боевой и dev-серверы. Причина — РФ-доступность/TLS: новый PROD теперь на fvds.ru (стабильно доступен из РФ).

## Итоговая топология (после свапа)

| | PROD | DEV |
|---|---|---|
| Домен | https://moooza.ru (+www) | https://dev.moooza.ru |
| Сервер | **B = 188.120.243.36** (`dimon1214.fvds.ru`) | **A = 81.31.246.105** |
| Ветка | `master` | `dev` |
| Данные | боевые (117 юзеров) | dev (101 юзер) |
| БД миграции | healthy | P3009 (как и было; api стартует через tsx-фолбэк) |

**Было наоборот:** PROD=A(81.31.246.105), DEV=B(188.120.243.36).

## Что сделано
1. **B → PROD:** checkout `master`, prod-`.env`, восстановлен боевой дамп БД (117 юзеров, 94 миграции), prod-uploads, host-nginx `moooza.ru` + LE-серт (CN=moooza.ru), пересборка web/api. Проверено: health/genres/socket.io 200, TLS валиден.
2. **Freeze A + финальная синхронизация:** остановлены api/web на A → консистентный дамп → доставлен на B и восстановлен (свежие данные, без потерь кроме окна заморозки, в котором записи невозможны).
3. **DNS** (сделал заказчик): `moooza.ru`,`www`→B; `dev.moooza.ru`→A. Пропагировано (8.8.8.8/1.1.1.1 отдают B). ⚠️ TTL записи A остался **21600 (6ч)** — часть кэшей может держать старый адрес до ~6ч.
4. **Мост A→B (временный):** host-nginx на A проксирует `moooza.ru` → B (SNI moooza.ru). Ловит тех, у кого ещё закэширован старый адрес A, и гарантирует единый источник записи (B) — без split-brain. **Удалить через ~24ч** (см. ниже).
5. **A → DEV:** checkout `dev`, dev-`.env` (сохранён с B как `/root/dev.env.bak`), восстановлены dev-данные (БД+uploads с B), host-nginx `dev.moooza.ru` + LE-серт (CN=dev.moooza.ru) + noindex + dev-robots. Проверено: dev.moooza.ru health 200, noindex, cert ok.

## Бэкапы / откат
- **A:** `/root/backup_prod_db.sql`, `/root/prod_final.sql` (финальный), `/root/backup_prod_uploads.tgz` (949M), `/root/prod.env.bak` (prod-секреты).
- **B:** `/root/backup_dev_db.sql`, `/root/backup_dev_uploads.tgz`, `/root/dev.env.bak`, `/root/staging/*`.
- **Откат:** вернуть DNS `moooza.ru`→A, на A `git checkout master` + prod-`.env` (`/root/prod.env.bak`) + restore `/root/prod_final.sql` + prod-uploads, `up -d`. Данные целы (в окне заморозки записей не было).

## Пост-своп действия (2026-07-04, продолжение)
- [x] **Мост A→B снят** — удалён `/etc/nginx/sites-enabled/moooza.ru` на A (бэкап `/root/moooza.enabled.orig.bak`), reload. A больше не отвечает за moooza.ru (cert-mismatch, fail-closed). moooza.ru→B по-прежнему 200.
- [x] **Мониторинг перенесён на PROD (B):** весь стек `/opt/monitoring` (grafana+prometheus+loki+promtail+node-exporter+cadvisor+uptime-kuma) поднят на B; тома grafana_data+uptime-kuma перенесены (дашборды/мониторы сохранены), prometheus/loki стартовали заново; серт grafana.moooza.ru + nginx-блоки grafana/status на B. `grafana.moooza.ru`/`status.moooza.ru`→B, TLS ок, 302→login. Стек на A **остановлен** (данные как бэкап). Осиротевшие grafana/status nginx-блоки на A удалены (sites-available копии оставлены для отката).
- [x] **Telegram — приём вебхуков работает на B** (эндпоинт `/api/auth/telegram/webhook` жив на B через moooza.ru→B, отдаёт 403 без валидного секрета — корректно). B `.env` содержит все `TELEGRAM_*` ключи.
- [x] **Telegram — ИСХОДЯЩИЕ работают.** На релее `tg.moooza.ru` (104.128.131.139, `/etc/nginx/sites-enabled/tg-relay`→symlink) allowlist сменён `allow 81.31.246.105;`→`allow 188.120.243.36;`, nginx reload (бэкап `/root/tg-relay.bak.*`). Проверено с B: getMe **200**, sendMessage **200** (тест-уведомление доставлено в MOOOZA_LOG, msg 2514). Репо-файл `deploy/tg-relay.block` обновлён под новый IP. DEV шлёт Telegram напрямую (релей ему не нужен).

## Хвосты (остаток)
- [x] **TTL** — заказчик выставил у хостера **86400 (24ч)**. Следствие: будущие изменения этих A-записей расходятся до суток. (Пункт «снизить TTL» закрыт решением заказчика.)
- [x] **Лишние серты удалены** (`certbot delete`, авторизовано заказчиком): на A убраны `moooza.ru`+`grafana.moooza.ru` (остался `dev.moooza.ru`); на B убран `dev.moooza.ru` (остались `moooza.ru`+`grafana.moooza.ru`). `nginx -t` ок на обоих, все 4 домена отдают 200/302 с валидным TLS. Теперь каждый сервер держит только свои серты → авто-renew не падает на чужих доменах.

**Свап и пост-своп задачи полностью завершены.** PROD=B (moooza.ru, grafana/status, telegram-бот, РФ-доступен), DEV=A (dev.moooza.ru).

## Гочи, всплывшие при свапе
- **`sites-enabled/*` — отдельные ФАЙЛЫ, не симлинки** (кроме grafana/status): правка `sites-available` не действует, писать прямо в `sites-enabled` + `systemctl reload nginx` (не только `nginx -t`!). [[project_seo]]
- **B отдавал dev-серт для SNI moooza.ru**, пока nginx не был **reload** (не reload = старый конфиг в памяти).
- Многоуровневые кавычки `plink→ssh→bash` ломаются на `(`/SQL — скрипты передавать **base64** и декодировать на месте.
