#!/bin/bash

# Скрипт для создания бэкапа PostgreSQL базы данных

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Директория для бэкапов
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Имя контейнера PostgreSQL
CONTAINER_NAME="mooza-postgres"

# Параметры БД
DB_USER="mooza"
DB_NAME="mooza_db"

# Имя файла бэкапа с датой
BACKUP_FILE="$BACKUP_DIR/mooza_backup_$(date +%Y%m%d_%H%M%S).sql"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Mooza Database Backup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Проверка, что контейнер запущен
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}❌ Контейнер $CONTAINER_NAME не запущен!${NC}"
    exit 1
fi

# Создание бэкапа
echo -e "${YELLOW}Создание бэкапа базы данных...${NC}"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    # Получаем размер файла
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Бэкап успешно создан!${NC}"
    echo -e "  Файл: ${GREEN}$BACKUP_FILE${NC}"
    echo -e "  Размер: ${GREEN}$SIZE${NC}"

    # Опционально: сжатие
    echo -e "${YELLOW}Сжать бэкап с помощью gzip? (y/n)${NC}"
    read -p "> " COMPRESS

    if [ "$COMPRESS" = "y" ] || [ "$COMPRESS" = "Y" ]; then
        gzip "$BACKUP_FILE"
        COMPRESSED_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
        echo -e "${GREEN}✓ Бэкап сжат${NC}"
        echo -e "  Файл: ${GREEN}${BACKUP_FILE}.gz${NC}"
        echo -e "  Размер: ${GREEN}$COMPRESSED_SIZE${NC}"
    fi

    # Удаление старых бэкапов (старше 7 дней)
    echo -e "${YELLOW}Удалить бэкапы старше 7 дней? (y/n)${NC}"
    read -p "> " DELETE_OLD

    if [ "$DELETE_OLD" = "y" ] || [ "$DELETE_OLD" = "Y" ]; then
        find "$BACKUP_DIR" -name "mooza_backup_*.sql*" -mtime +7 -delete
        echo -e "${GREEN}✓ Старые бэкапы удалены${NC}"
    fi

else
    echo -e "${RED}❌ Ошибка при создании бэкапа!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Готово!${NC}"
echo ""
echo -e "${YELLOW}Для восстановления из бэкапа используйте:${NC}"
if [ "$COMPRESS" = "y" ] || [ "$COMPRESS" = "Y" ]; then
    echo -e "  ${GREEN}gunzip < ${BACKUP_FILE}.gz | docker exec -i $CONTAINER_NAME psql -U $DB_USER $DB_NAME${NC}"
else
    echo -e "  ${GREEN}cat $BACKUP_FILE | docker exec -i $CONTAINER_NAME psql -U $DB_USER $DB_NAME${NC}"
fi
echo ""
