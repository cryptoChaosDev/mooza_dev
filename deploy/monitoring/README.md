# Мониторинг (Grafana / Prometheus / Loki)

Стек живёт на **PROD-сервере** в `/opt/monitoring` (docker compose: grafana, prometheus,
loki, promtail, node-exporter, cadvisor, uptime-kuma). За host-nginx:
- **grafana.moooza.ru** → grafana (127.0.0.1:3010), логин admin (пароль в compose `GF_SECURITY_ADMIN_PASSWORD`)
- **status.moooza.ru** → uptime-kuma (127.0.0.1:3001)

Источники данных (provisioned, фикс. UID): Prometheus `prometheus` (default), Loki `loki`.
Скрейп-таргеты: node-exporter (хост), cadvisor (контейнеры), prometheus. Метки: `instance="moooza-prod"`.

## Дашборды
Provisioned из `/opt/monitoring/grafana/provisioning/dashboards/defs/*.json`
(провайдер `dashboards.yml`, папка **Moooza**, `updateIntervalSeconds=30`, `allowUiUpdates=true`).
Положил файл в defs → Grafana подхватит за ≤30с (перезапуск не обязателен).

- **Moooza — Обзор системы** (`moooza-overview`) — ключевой отчёт. Хост: CPU/RAM/Disk/Swap/Load/Uptime
  (stat с порогами) + CPU по режимам, память, сеть eth0, диск vda. Контейнеры: CPU, память,
  сеть, перезапуски за 24ч по каждому (mooza-api/web/postgres + мониторинг + uptime-kuma).
  Генерируется `build_overview_dashboard.py` (в этой папке; копия на сервере `/root/`).
- **Node Exporter Full**, **Cadvisor exporter** — стандартные глубокие дашборды.
- **Moooza — Logs (Loki)** — логи.

### Обновить/перегенерить обзорный дашборд
```
# на PROD-сервере:
python3 /root/build_overview_dashboard.py     # пишет defs/moooza-overview.json
# (grafana подхватит сама; для мгновенного эффекта: docker restart monitoring-grafana)
```

## ГОЧА: cadvisor и версия Docker API
cadvisor **v0.49.1 не видел имена контейнеров** на новом PROD (B): его docker-клиент (API 1.41)
отвергается более новым Docker-демоном (min API 1.44) → docker-factory не регистрируется →
метрики только по cgroup-`id`, без лейбла `name`. **Фикс:** образ обновлён до
`gcr.io/cadvisor/cadvisor:latest` (v0.55.1) — docker-factory поднялся, `name` (mooza-api/web/postgres…)
резолвится. При пересоздании стека держать cadvisor достаточно новым для текущего Docker API.
