#!/usr/bin/env bash
# VPS hardening: UFW + fail2ban (P1) and BBR + swap (P2). Idempotent.
set -uo pipefail

echo "===== P1: UFW ====="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
# Zabbix agent (10050) only from Timeweb monitoring servers
for ip in 92.53.116.12 92.53.116.111 92.53.116.119; do
  ufw allow from "$ip" to any port 10050 proto tcp
done
ufw --force enable
ufw status verbose

echo "===== P1: fail2ban ====="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y fail2ban >/dev/null
cat > /etc/fail2ban/jail.local <<'CFG'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
CFG
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd || true

echo "===== P2: BBR ====="
modprobe tcp_bbr 2>/dev/null || true
cat > /etc/sysctl.d/99-net-tuning.conf <<'CFG'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
CFG

echo "===== P2: swap ====="
if swapon --show | grep -q . ; then
  echo "swap already present, skipping creation"
else
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
cat > /etc/sysctl.d/99-swappiness.conf <<'CFG'
vm.swappiness = 10
vm.vfs_cache_pressure = 50
CFG

sysctl --system >/dev/null 2>&1 || true

echo "===== VERIFY ====="
echo -n "congestion_control: "; sysctl -n net.ipv4.tcp_congestion_control
echo -n "qdisc: "; sysctl -n net.core.default_qdisc
echo -n "swappiness: "; sysctl -n vm.swappiness
free -h | grep -iE 'swap|mem'
echo "===== DONE ====="
