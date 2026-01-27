#!/bin/bash

# Скрипт для полного сброса приложения на VPS

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}========================================${NC}"
echo -e "${RED}   ⚠️  ВНИМАНИЕ! ⚠️${NC}"
echo -e "${RED}========================================${NC}"
echo ""
echo -e "${RED}Этот скрипт удалит:${NC}"
echo -e "${RED}- Все контейнеры${NC}"
echo -e "${RED}- ВСЕ ДАННЫЕ из базы данных PostgreSQL${NC}"
echo -e "${RED}- Все загруженные файлы (аватары, посты)${NC}"
echo ""
echo -e "${YELLOW}После этого будет создана чистая установка.${NC}"
echo ""
read -p "Вы уверены? Введите 'yes' для продолжения: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${GREEN}Операция отменена${NC}"
    exit 0
fi

# Определяем команду docker compose
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo ""
echo -e "${YELLOW}[1/5] Остановка контейнеров...${NC}"
$DOCKER_COMPOSE -f docker-compose.prod.yml down 2>/dev/null || $DOCKER_COMPOSE down

echo ""
echo -e "${YELLOW}[2/5] Удаление volumes (базы данных)...${NC}"
$DOCKER_COMPOSE -f docker-compose.prod.yml down -v 2>/dev/null || $DOCKER_COMPOSE down -v

echo ""
echo -e "${YELLOW}[3/5] Удаление старых образов...${NC}"
docker rmi mooza_dev-api mooza_dev-web 2>/dev/null || true

echo ""
echo -e "${YELLOW}[4/5] Очистка uploads...${NC}"
rm -rf server/uploads/*
mkdir -p server/uploads
touch server/uploads/.gitkeep

echo ""
echo -e "${YELLOW}[5/5] Удаление старой конфигурации...${NC}"
rm -f docker-compose.prod.yml .env

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   ✅ Сброс завершен!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Теперь запустите:${NC}"
echo -e "${GREEN}  ./deploy.sh${NC}"
echo ""
echo -e "${YELLOW}Для создания свежей установки приложения.${NC}"
echo ""
