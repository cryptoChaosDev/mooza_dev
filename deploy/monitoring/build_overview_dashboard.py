#!/usr/bin/env python3
# Generates the "Moooza - System Overview" Grafana dashboard (provisioned JSON).
# Run ON the monitoring host (PROD/B): writes into the grafana provisioning defs dir,
# grafana's file provider (updateIntervalSeconds=30) picks it up automatically.
#   python3 build_overview_dashboard.py
# Datasource: Prometheus (uid "prometheus"). Metrics: node-exporter (host) + cadvisor (containers).
import json, os

DS = {"type": "prometheus", "uid": "prometheus"}
CONT = 'name=~"mooza-.*|uptime-kuma|monitoring-.*"'
APP  = 'name=~"mooza-.*"'
panels = []
_id = [0]
def nid():
    _id[0] += 1; return _id[0]

def row(title, y):
    return {"type": "row", "title": title, "collapsed": False,
            "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "id": nid(), "panels": []}

def stat(title, expr, x, y, unit, steps, w=4, h=4, decimals=1, legend=""):
    return {
        "type": "stat", "title": title, "id": nid(), "datasource": DS,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "fieldConfig": {"defaults": {
            "unit": unit, "decimals": decimals,
            "thresholds": {"mode": "absolute", "steps": steps},
            "color": {"mode": "thresholds"}}, "overrides": []},
        "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                     "orientation": "auto", "textMode": "auto", "colorMode": "value",
                     "graphMode": "area", "justifyMode": "auto"},
        "targets": [{"refId": "A", "expr": expr, "datasource": DS, "legendFormat": legend}],
    }

def ts(title, targets, x, y, unit, w=12, h=8, stack=False, legend_table=False, fill=15):
    return {
        "type": "timeseries", "title": title, "id": nid(), "datasource": DS,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "fieldConfig": {"defaults": {"unit": unit, "color": {"mode": "palette-classic"},
            "custom": {"drawStyle": "line", "lineWidth": 1, "fillOpacity": fill,
                        "showPoints": "never", "spanNulls": True,
                        "stacking": {"mode": "normal" if stack else "none", "group": "A"}}},
            "overrides": []},
        "options": {"legend": {"displayMode": "table" if legend_table else "list",
                                 "placement": "bottom",
                                 "calcs": ["lastNotNull", "max"] if legend_table else []},
                     "tooltip": {"mode": "multi", "sort": "desc"}},
        "targets": [{"refId": chr(65 + i), "expr": e, "datasource": DS, "legendFormat": l}
                     for i, (e, l) in enumerate(targets)],
    }

def table(title, expr, x, y, valuename, w=12, h=8):
    return {
        "type": "table", "title": title, "id": nid(), "datasource": DS,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "fieldConfig": {"defaults": {"custom": {"filterable": True, "align": "auto"}}, "overrides": []},
        "options": {"showHeader": True, "footer": {"show": False}},
        "targets": [{"refId": "A", "expr": expr, "datasource": DS, "format": "table", "instant": True}],
        "transformations": [{"id": "organize", "options": {
            "excludeByName": {"Time": True, "job": True, "instance": True, "__name__": True,
                               "id": True, "image": True},
            "renameByName": {"name": "Контейнер", "Value": valuename}}}],
    }

G = [("green", None), ("yellow", 75), ("red", 90)]
SW = [("green", None), ("yellow", 25), ("red", 50)]
LD = [("green", None), ("yellow", 4), ("red", 6)]
def steps(pairs): return [{"color": c, "value": v} for c, v in pairs]

y = 0
panels.append(row("🖥 Хост — ресурсы", y)); y += 1
panels.append(stat("CPU занято", '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', 0,  y, "percent", steps(G)))
panels.append(stat("RAM занято", '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100', 4, y, "percent", steps(G)))
panels.append(stat("Диск / занято", '(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100', 8, y, "percent", steps(G)))
panels.append(stat("Swap занято", '(1 - node_memory_SwapFree_bytes / node_memory_SwapTotal_bytes) * 100', 12, y, "percent", steps(SW)))
panels.append(stat("Load 1m", 'node_load1', 16, y, "short", steps(LD), decimals=2))
panels.append(stat("Аптайм", 'node_time_seconds - node_boot_time_seconds', 20, y, "s", [{"color": "blue", "value": None}], decimals=0))
y += 4
panels.append(ts("CPU по режимам, %", [('avg by(mode)(rate(node_cpu_seconds_total{mode!="idle"}[5m])) * 100', "{{mode}}")], 0, y, "percent", stack=True, fill=30))
panels.append(ts("Память", [
    ('node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes', "Использовано"),
    ('node_memory_MemAvailable_bytes', "Доступно"),
    ('node_memory_MemTotal_bytes', "Всего")], 12, y, "bytes"))
y += 8
panels.append(ts("Сеть eth0", [
    ('rate(node_network_receive_bytes_total{device="eth0"}[5m])', "← приём"),
    ('rate(node_network_transmit_bytes_total{device="eth0"}[5m])', "→ отдача")], 0, y, "Bps"))
panels.append(ts("Дисковый I/O (vda)", [
    ('rate(node_disk_read_bytes_total{device="vda"}[5m])', "чтение"),
    ('rate(node_disk_written_bytes_total{device="vda"}[5m])', "запись")], 12, y, "Bps"))
y += 8
panels.append(row("📦 Контейнеры (Moooza)", y)); y += 1
panels.append(ts("CPU контейнеров, %", [('sum by(name)(rate(container_cpu_usage_seconds_total{%s}[5m])) * 100' % CONT, "{{name}}")], 0, y, "percent", legend_table=True))
panels.append(ts("Память контейнеров (working set)", [('container_memory_working_set_bytes{%s}' % CONT, "{{name}}")], 12, y, "bytes", legend_table=True))
y += 8
panels.append(ts("Сеть контейнеров (mooza)", [
    ('sum by(name)(rate(container_network_receive_bytes_total{%s}[5m]))' % APP, "{{name}} ←"),
    ('sum by(name)(rate(container_network_transmit_bytes_total{%s}[5m]))' % APP, "{{name}} →")], 0, y, "Bps"))
panels.append(table("Перезапуски контейнеров (24ч)", 'changes(container_start_time_seconds{%s}[24h])' % CONT, 12, y, "Перезапуски 24ч"))

dash = {
    "id": None, "uid": "moooza-overview", "title": "Moooza — Обзор системы",
    "tags": ["moooza", "overview"], "timezone": "browser", "schemaVersion": 39,
    "version": 1, "refresh": "30s", "editable": True, "graphTooltip": 1,
    "time": {"from": "now-6h", "to": "now"},
    "templating": {"list": []}, "annotations": {"list": []},
    "panels": panels,
}

out = os.environ.get("OUT", "/opt/monitoring/grafana/provisioning/dashboards/defs/moooza-overview.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(dash, f, ensure_ascii=False, indent=2)
print("wrote", out, "panels:", len([p for p in panels if p["type"] != "row"]), "+ rows")
