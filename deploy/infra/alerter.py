#!/usr/bin/env python3
# Moooza PROD alerter: queries Prometheus, alerts to MOOOZA_LOG (via tg relay) on threshold breaches.
# State-based (only on transition ok<->firing) so it never spams. Runs every 5 min via systemd timer.
import urllib.request, urllib.parse, json, os

PROM = "http://127.0.0.1:9090/api/v1/query"
STATE = "/root/alert_state"
os.makedirs(STATE, exist_ok=True)

def q(expr):
    u = PROM + "?" + urllib.parse.urlencode({"query": expr})
    try:
        r = json.load(urllib.request.urlopen(u, timeout=10))["data"]["result"]
        return float(r[0]["value"][1]) if r else None
    except Exception:
        return None

def env(k):
    try:
        for line in open("/opt/mooza/.env"):
            if line.startswith(k + "="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

BASE = (env("TELEGRAM_API_BASE") or "https://api.telegram.org").rstrip("/")
TOKEN = env("TELEGRAM_LOG_TOKEN"); CHAT = env("TELEGRAM_LOG_CHAT_ID")

def notify(text):
    data = urllib.parse.urlencode({"chat_id": CHAT, "text": text}).encode()
    try:
        urllib.request.urlopen(BASE + "/bot" + TOKEN + "/sendMessage", data=data, timeout=15)
    except Exception:
        pass

pct = lambda v: f"{v:.1f}%"
num = lambda v: f"{v:.2f}"
cnt = lambda v: f"{int(v)}"
# (key, human, query, threshold_fn, format_fn, edge)
checks = [
    ("disk", "Диск / >85%", '(1 - node_filesystem_avail_bytes{mountpoint="/"}/node_filesystem_size_bytes{mountpoint="/"})*100', lambda v: v is not None and v > 85, pct, False),
    ("ram",  "RAM >90%",     '(1 - node_memory_MemAvailable_bytes/node_memory_MemTotal_bytes)*100', lambda v: v is not None and v > 90, pct, False),
    ("cpu",  "CPU >90% (5м)", '100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))*100', lambda v: v is not None and v > 90, pct, False),
    ("swap", "Swap >50%",    '(1 - node_memory_SwapFree_bytes/node_memory_SwapTotal_bytes)*100', lambda v: v is not None and v > 50, pct, False),
    ("load", "Load1 >12",    'node_load1', lambda v: v is not None and v > 12, num, False),
    ("target_down", "Prometheus target(s) недоступны", 'count(up==0)', lambda v: v is not None and v > 0, cnt, False),
    ("api_restart", "mooza-api перезапустился", 'changes(container_start_time_seconds{name="mooza-api"}[10m])', lambda v: v is not None and v > 0, lambda v: f"{int(v)}x/10м", True),
    ("pg_restart",  "mooza-postgres перезапустился", 'changes(container_start_time_seconds{name="mooza-postgres"}[10m])', lambda v: v is not None and v > 0, lambda v: f"{int(v)}x/10м", True),
]

fired = []
for key, human, expr, firing, fmt, edge in checks:
    v = q(expr)
    now = firing(v)
    sf = os.path.join(STATE, key)
    exists = os.path.exists(sf)
    prev = open(sf).read().strip() if exists else None
    if not exists:
        open(sf, "w").write("firing" if now else "ok")           # baseline, silent
    elif now and prev != "firing":
        notify(f"\U0001F534 АЛЕРТ PROD: {human}\nтекущее: {fmt(v) if v is not None else 'н/д'}")
        open(sf, "w").write("firing"); fired.append(key)
    elif not now and prev == "firing":
        if not edge:
            notify(f"\U0001F7E2 Восстановлено PROD: {human}")
        open(sf, "w").write("ok")
print("alerter run: fired=", fired or "none")
