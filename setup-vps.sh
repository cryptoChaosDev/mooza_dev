#!/bin/bash

# Скрипт первоначальной настройки VPS для Mooza

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Mooza VPS Initial Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Проверка, что скрипт запущен с правами root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Запустите скрипт с sudo:${NC}"
    echo "   sudo ./setup-vps.sh"
    exit 1
fi

# Обновление системы
echo -e "${YELLOW}1. Обновление системы...${NC}"
apt update && apt upgrade -y
echo -e "${GREEN}✓ Система обновлена${NC}"

# Установка Docker
echo -e "${YELLOW}2. Установка Docker...${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker уже установлен${NC}"
else
    # Удаляем старые версии
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    # Устанавливаем зависимости
    apt install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

    # Добавляем официальный GPG ключ Docker
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

    # Добавляем репозиторий Docker
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Устанавливаем Docker
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Запускаем Docker
    systemctl start docker
    systemctl enable docker

    echo -e "${GREEN}✓ Docker установлен и запущен${NC}"
fi

# Проверка версии Docker
docker --version
docker compose version

# Установка дополнительных утилит
echo -e "${YELLOW}3. Установка дополнительных утилит...${NC}"
apt install -y \
    git \
    curl \
    wget \
    ufw \
    htop \
    nano \
    openssl

echo -e "${GREEN}✓ Утилиты установлены${NC}"

# Настройка файрвола
echo -e "${YELLOW}4. Настройка файрвола UFW...${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Разрешаем SSH
ufw allow 22/tcp comment 'SSH'

# Разрешаем HTTP/HTTPS
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Разрешаем порты приложения
ufw allow 3000/tcp comment 'Mooza Web'
ufw allow 4000/tcp comment 'Mooza API'

# НЕ открываем 5432 (PostgreSQL)!

echo -e "${YELLOW}Активировать файрвол? (y/n)${NC}"
read -p "> " ACTIVATE_UFW

if [ "$ACTIVATE_UFW" = "y" ] || [ "$ACTIVATE_UFW" = "Y" ]; then
    ufw --force enable
    echo -e "${GREEN}✓ Файрвол активирован${NC}"
    ufw status numbered
else
    echo -e "${YELLOW}⚠️  Файрвол НЕ активирован. Активируйте позже: sudo ufw enable${NC}"
fi

# Настройка swap (если нужно)
echo -e "${YELLOW}5. Проверка swap...${NC}"
if [ $(swapon --show | wc -l) -eq 0 ]; then
    echo -e "${YELLOW}Swap не найден. Создать swap файл на 2GB? (y/n)${NC}"
    read -p "> " CREATE_SWAP

    if [ "$CREATE_SWAP" = "y" ] || [ "$CREATE_SWAP" = "Y" ]; then
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
        echo -e "${GREEN}✓ Swap создан${NC}"
    fi
else
    echo -e "${GREEN}✓ Swap уже настроен${NC}"
fi

# Создание директории для проекта
echo -e "${YELLOW}6. Создание директории проекта...${NC}"
mkdir -p /opt/mooza
chown -R $SUDO_USER:$SUDO_USER /opt/mooza
echo -e "${GREEN}✓ Директория создана: /opt/mooza${NC}"

# Настройка автоматической очистки Docker
echo -e "${YELLOW}7. Настройка автоматической очистки Docker...${NC}"
cat > /etc/cron.weekly/docker-cleanup << 'EOF'
#!/bin/bash
docker system prune -af --volumes
EOF
chmod +x /etc/cron.weekly/docker-cleanup
echo -e "${GREEN}✓ Настроена еженедельная очистка Docker${NC}"

# Установка Nginx (опционально)
echo -e "${YELLOW}8. Установить Nginx для reverse proxy? (y/n, рекомендуется для production)${NC}"
read -p "> " INSTALL_NGINX

if [ "$INSTALL_NGINX" = "y" ] || [ "$INSTALL_NGINX" = "Y" ]; then
    apt install -y nginx
    systemctl start nginx
    systemctl enable nginx
    echo -e "${GREEN}✓ Nginx установлен${NC}"

    # Установка Certbot для SSL
    echo -e "${YELLOW}Установить Certbot для SSL сертификатов? (y/n)${NC}"
    read -p "> " INSTALL_CERTBOT

    if [ "$INSTALL_CERTBOT" = "y" ] || [ "$INSTALL_CERTBOT" = "Y" ]; then
        apt install -y certbot python3-certbot-nginx
        echo -e "${GREEN}✓ Certbot установлен${NC}"
        echo -e "${YELLOW}Для получения SSL сертификата выполните:${NC}"
        echo -e "   sudo certbot --nginx -d your-domain.com"
    fi
fi

# Итоговая информация
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Настройка VPS завершена!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Установлено:${NC}"
echo -e "  ✓ Docker $(docker --version | cut -d ' ' -f3)"
echo -e "  ✓ Docker Compose"
echo -e "  ✓ UFW Firewall"
echo -e "  ✓ Git, curl, wget"
echo -e "  ✓ Директория проекта: /opt/mooza"

if [ "$INSTALL_NGINX" = "y" ] || [ "$INSTALL_NGINX" = "Y" ]; then
    echo -e "  ✓ Nginx"
fi

if [ "$INSTALL_CERTBOT" = "y" ] || [ "$INSTALL_CERTBOT" = "Y" ]; then
    echo -e "  ✓ Certbot"
fi

echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo -e "  1. Склонируйте или загрузите проект в ${GREEN}/opt/mooza${NC}"
echo -e "  2. Перейдите в директорию: ${GREEN}cd /opt/mooza${NC}"
echo -e "  3. Запустите скрипт развертывания: ${GREEN}./deploy.sh${NC}"
echo ""
echo -e "${YELLOW}Полезная информация:${NC}"
echo -e "  Статус Docker: ${GREEN}sudo systemctl status docker${NC}"
echo -e "  Статус UFW: ${GREEN}sudo ufw status${NC}"
echo -e "  Логи системы: ${GREEN}journalctl -xe${NC}"
echo ""
