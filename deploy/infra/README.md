# Инфраструктурные улучшения PROD (2026-07-04)

Быстрые победы, применённые на боевом сервере (**PROD = B, 188.120.243.36**). DEV = A (81.31.246.105).
Всё, что тут — это **живая инфраструктура на серверах** (репо-копии для воспроизводимости; сам код не в git-деплое).

## 1. Автобэкапы БД + uploads (offsite)
- Скрипт `backup_prod.sh` → на PROD `/root/backup_prod.sh`. Делает `pg_dump | gzip` (версионно, ретеншен 14д) и зеркалит `server/uploads` **на DEV-хост A** (офсайт) по SSH-ключу `/root/.ssh/id_ed25519_bkp` (в `authorized_keys` A ограничен `from="188.120.243.36"`). Уведомляет MOOOZA_LOG через релей.
- Куда кладёт на A: `/root/prod_backups/{db,uploads}`.
- Таймер: `mooza-backup.timer` — **ежедневно 04:00 MSK** (`OnCalendar=*-*-* 04:00:00`, `Persistent=true`).
- Проверить: `systemctl list-timers mooza-backup.timer` · ручной прогон: `/root/backup_prod.sh`.

## 2. Ротация docker-логов
- `/etc/docker/daemon.json` на обоих серверах: `json-file`, `max-size 10m`, `max-file 3`.
- **Активация требует `systemctl restart docker` + пересоздание контейнеров** (existing контейнеры держат лог-конфиг с момента создания). На B применено; на A — применится при следующем деплое/ребуте (daemon.json уже на месте).

## 3. BBR (оба сервера)
- `/etc/sysctl.d/99-bbr.conf`: `net.core.default_qdisc=fq`, `net.ipv4.tcp_congestion_control=bbr`. Лучше для РФ-каналов на потерях.

## 4. fail2ban (оба сервера)
- Джейл `sshd` (`/etc/fail2ban/jail.d/sshd.local`: maxretry 5, findtime 10m, bantime 1h). Реально работает — на серверах тысячи брутфорс-попыток (см. `fail2ban-client status sshd`).

## 5. Healthcheck'и + mem-лимиты
- `docker-compose.override.yml` на PROD `/opt/mooza/` (auto-merge к базовому compose): healthcheck для `api`(/api/health) и `web`(:3000), `mem_limit` api=1g, web=128m, postgres=1g (postgres healthcheck уже был). Лимиты щедрые (норма api~96МБ/web~7МБ/pg~78МБ) — ловят разгон, не мешают. Копия — `docker-compose.override.yml` здесь.

## 6. Алерты (Prometheus → Telegram)
- `alerter.py` → на PROD `/root/alerter.py`. Каждые 5 мин (`mooza-alerts.timer`, `OnCalendar=*:0/5`) опрашивает Prometheus и шлёт в MOOOZA_LOG **только при переходе порога** (state в `/root/alert_state/`, без спама). Проверки: диск/`85%, RAM>90%, CPU>90%(5м), Swap>50%, Load1>12, target down, api/postgres перезапуск.
- Почему не нативные Grafana-алерты: Grafana не может слать в Telegram через релей (RF-блок api.telegram.org + формат payload). Скрипт переиспользует рабочий путь через релей.

## systemd unit'ы (PROD)
```ini
# /etc/systemd/system/mooza-backup.service  -> ExecStart=/root/backup_prod.sh (Type=oneshot)
# /etc/systemd/system/mooza-backup.timer    -> OnCalendar=*-*-* 04:00:00  Persistent=true
# /etc/systemd/system/mooza-alerts.service  -> ExecStart=/usr/bin/python3 /root/alerter.py
# /etc/systemd/system/mooza-alerts.timer    -> OnCalendar=*:0/5
# /etc/systemd/system/mooza-status.service/.timer -> часовой heartbeat (см. deploy/hourly-status.sh)
```

## Ещё НЕ сделано (обсудить)
- **SSH-хардненинг**: `PermitRootLogin yes` + `PasswordAuthentication yes` на обоих (риск, требует настройки ключей — делать с заказчиком, чтобы не потерять доступ).
- Ротация засвеченных паролей (root/БД/Grafana). CI/CD. Staging. HA/реплика Postgres. Multi-stage `server/Dockerfile` + non-root. См. отчёт-аудит в чате.
