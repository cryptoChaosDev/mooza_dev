#!/bin/bash

# Настройка HTTPS для moooza.ru через nginx + Let's Encrypt
# Запускать на VPS от root: sudo ./https-setup.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOMAIN="moooza.ru"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Mooza HTTPS Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Запустите с sudo: sudo ./https-setup.sh${NC}"
    exit 1
fi

# 1. Установка nginx и certbot
echo -e "${YELLOW}1. Установка nginx и certbot...${NC}"
apt update -q
apt install -y nginx certbot python3-certbot-nginx || apt-get install -f -y
dpkg --configure -a 2>/dev/null || true
echo -e "${GREEN}✓ Пакеты установлены${NC}"

# 2. Чистим дефолтные конфиги nginx, которые мешают запуску
echo -e "${YELLOW}2. Чистка дефолтных конфигов nginx...${NC}"
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/conf.d/default.conf
# Убираем всё что слушает нестандартные порты (8080 и т.п.)
for f in /etc/nginx/sites-enabled/*; do
    if grep -qE 'listen\s+(8080|8000|8888)' "$f" 2>/dev/null; then
        echo -e "${YELLOW}   Убираю конфликтующий конфиг: $f${NC}"
        rm -f "$f"
    fi
done
echo -e "${GREEN}✓ Дефолтные конфиги убраны${NC}"

# 3. Создаём временный HTTP-only конфиг (без SSL — certbot добавит сам)
echo -e "${YELLOW}3. Создание nginx конфига...${NC}"
cat > /etc/nginx/sites-available/moooza.ru << 'NGINXEOF'
server {
    listen 80;
    server_name moooza.ru www.moooza.ru;

    client_max_body_size 20M;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location /api/ {
        proxy_pass         http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass         http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/moooza.ru /etc/nginx/sites-enabled/moooza.ru

nginx -t || { echo -e "${RED}❌ Ошибка в конфиге nginx${NC}"; nginx -t 2>&1; exit 1; }
systemctl restart nginx
echo -e "${GREEN}✓ nginx запущен${NC}"

# 4. Получение SSL-сертификата (certbot сам добавит SSL в конфиг)
echo -e "${YELLOW}4. Получение SSL-сертификата...${NC}"
echo -e "${YELLOW}   Убедитесь, что DNS A-записи уже указывают на этот сервер!${NC}"
echo ""

certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ SSL-сертификат получен, nginx обновлён${NC}"
else
    echo -e "${RED}❌ Не удалось получить сертификат.${NC}"
    echo -e "${YELLOW}   Проверьте, что DNS-записи указывают на этот IP и порт 80 доступен.${NC}"
    echo -e "${YELLOW}   Попробуйте вручную: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}${NC}"
    exit 1
fi

# 5. Настройка файрвола
echo -e "${YELLOW}5. Обновление файрвола...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp comment 'HTTP' 2>/dev/null
    ufw allow 443/tcp comment 'HTTPS' 2>/dev/null
    ufw delete allow 3000/tcp 2>/dev/null || true
    ufw delete allow 4000/tcp 2>/dev/null || true
    echo -e "${GREEN}✓ Файрвол обновлён${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   HTTPS настроен!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Сайт доступен по адресу: ${GREEN}https://${DOMAIN}${NC}"
echo ""
echo -e "${YELLOW}Теперь пересоберите фронтенд с VITE_API_URL=https://moooza.ru:${NC}"
echo -e "  ${GREEN}docker compose -f docker-compose.prod.yml build --no-cache web${NC}"
echo -e "  ${GREEN}docker compose -f docker-compose.prod.yml up -d web${NC}"
echo ""
