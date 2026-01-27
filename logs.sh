#!/bin/bash

# Скрипт для быстрого просмотра логов

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Определяем команду docker compose
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Mooza Logs Viewer${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Выберите, какие логи просмотреть:"
echo ""
echo "  1) Все сервисы"
echo "  2) API (backend)"
echo "  3) Web (frontend)"
echo "  4) PostgreSQL"
echo "  5) Только последние 50 строк всех сервисов"
echo "  6) Следить за логами в реальном времени (follow)"
echo ""
read -p "Ваш выбор (1-6): " CHOICE

case $CHOICE in
    1)
        echo -e "${YELLOW}Показываем все логи...${NC}"
        $DOCKER_COMPOSE -f docker-compose.prod.yml logs
        ;;
    2)
        echo -e "${YELLOW}Показываем логи API...${NC}"
        $DOCKER_COMPOSE -f docker-compose.prod.yml logs api
        ;;
    3)
        echo -e "${YELLOW}Показываем логи Web...${NC}"
        $DOCKER_COMPOSE -f docker-compose.prod.yml logs web
        ;;
    4)
        echo -e "${YELLOW}Показываем логи PostgreSQL...${NC}"
        $DOCKER_COMPOSE -f docker-compose.prod.yml logs postgres
        ;;
    5)
        echo -e "${YELLOW}Показываем последние 50 строк...${NC}"
        $DOCKER_COMPOSE -f docker-compose.prod.yml logs --tail=50
        ;;
    6)
        echo -e "${YELLOW}Следим за логами (Ctrl+C для выхода)...${NC}"
        $DOCKER_COMPOSE -f docker-compose.prod.yml logs -f
        ;;
    *)
        echo "Неверный выбор"
        exit 1
        ;;
esac
