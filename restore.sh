#!/bin/bash

# Скрипт для восстановления базы данных из бэкапа

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Директория с бэкапами
BACKUP_DIR="./backups"

# Имя контейнера PostgreSQL
CONTAINER_NAME="mooza-postgres"

# Параметры БД
DB_USER="mooza"
DB_NAME="mooza_db"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Mooza Database Restore${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Проверка, что контейнер запущен
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}❌ Контейнер $CONTAINER_NAME не запущен!${NC}"
    exit 1
fi

# Показываем доступные бэкапы
echo -e "${YELLOW}Доступные бэкапы:${NC}"
echo ""
ls -lh "$BACKUP_DIR"/mooza_backup_*.sql* 2>/dev/null | awk '{print "  " NR ") " $9 " (" $5 ")"}'

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Бэкапы не найдены в $BACKUP_DIR${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Введите полный путь к файлу бэкапа:${NC}"
read -p "> " BACKUP_FILE

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Файл не найден: $BACKUP_FILE${NC}"
    exit 1
fi

# Предупреждение
echo ""
echo -e "${RED}⚠️  ВНИМАНИЕ! ⚠️${NC}"
echo -e "${RED}Восстановление базы данных удалит все текущие данные!${NC}"
echo -e "${YELLOW}Вы уверены, что хотите продолжить? (yes/no)${NC}"
read -p "> " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Операция отменена${NC}"
    exit 0
fi

# Создаем бэкап текущей БД перед восстановлением
echo -e "${YELLOW}Создание бэкапа текущей БД перед восстановлением...${NC}"
SAFETY_BACKUP="$BACKUP_DIR/safety_backup_$(date +%Y%m%d_%H%M%S).sql"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$SAFETY_BACKUP"
echo -e "${GREEN}✓ Страховочный бэкап создан: $SAFETY_BACKUP${NC}"

# Определяем, сжат ли файл
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo -e "${YELLOW}Восстановление из сжатого бэкапа...${NC}"
    gunzip < "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" "$DB_NAME"
else
    echo -e "${YELLOW}Восстановление из бэкапа...${NC}"
    cat "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" "$DB_NAME"
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ База данных успешно восстановлена!${NC}"
    echo ""
    echo -e "${YELLOW}Рекомендуется перезапустить API:${NC}"
    echo -e "  ${GREEN}docker-compose -f docker-compose.prod.yml restart api${NC}"
else
    echo -e "${RED}❌ Ошибка при восстановлении базы данных!${NC}"
    echo -e "${YELLOW}Страховочный бэкап доступен: $SAFETY_BACKUP${NC}"
    exit 1
fi

echo ""
