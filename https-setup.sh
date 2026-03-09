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
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx
echo -e "${GREEN}✓ nginx и certbot установлены${NC}"

# 2. Копируем конфиг nginx
echo -e "${YELLOW}2. Настройка nginx...${NC}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "${SCRIPT_DIR}/nginx/moooza.ru.conf" /etc/nginx/sites-available/moooza.ru
ln -sf /etc/nginx/sites-available/moooza.ru /etc/nginx/sites-enabled/moooza.ru
rm -f /etc/nginx/sites-enabled/default

nginx -t || { echo -e "${RED}❌ Ошибка в конфиге nginx${NC}"; exit 1; }
systemctl reload nginx
echo -e "${GREEN}✓ nginx настроен${NC}"

# 3. Получение SSL-сертификата
echo -e "${YELLOW}3. Получение SSL-сертификата...${NC}"
echo -e "${YELLOW}   Убедитесь, что DNS A-запись уже указывает на этот сервер!${NC}"
echo ""

certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ SSL-сертификат получен${NC}"
else
    echo -e "${RED}❌ Не удалось получить сертификат.${NC}"
    echo -e "${YELLOW}   Проверьте, что DNS записи указывают на этот IP и порт 80 открыт.${NC}"
    echo -e "${YELLOW}   Попробуйте вручную: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}${NC}"
    exit 1
fi

# 4. Настройка файрвола — закрываем прямой доступ к портам 3000/4000
echo -e "${YELLOW}4. Обновление файрвола...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw delete allow 3000/tcp 2>/dev/null || true
    ufw delete allow 4000/tcp 2>/dev/null || true
    echo -e "${GREEN}✓ Файрвол обновлён (порты 3000/4000 закрыты снаружи, 80/443 открыты)${NC}"
fi

# 5. Проверка автообновления сертификата
echo -e "${YELLOW}5. Проверка автообновления сертификата...${NC}"
systemctl status certbot.timer --no-pager 2>/dev/null || \
    echo -e "${YELLOW}   Запустите certbot renew вручную раз в 3 месяца, или:${NC}
   echo '0 3 * * * root certbot renew --quiet' >> /etc/crontab"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   HTTPS настроен!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Сайт доступен по адресу: ${GREEN}https://${DOMAIN}${NC}"
echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo -e "  1. Пересоберите фронтенд с новым VITE_API_URL:"
echo -e "     ${GREEN}docker compose -f docker-compose.prod.yml build --no-cache web${NC}"
echo -e "     ${GREEN}docker compose -f docker-compose.prod.yml up -d web${NC}"
echo ""
