# 🚀 Применение индексов базы данных

Эта инструкция поможет применить новые индексы для оптимизации производительности базы данных.

## Что было добавлено?

Добавлены индексы для всех таблиц, которые значительно ускорят:
- Поиск пользователей по городу, профессии, роли
- Загрузку ленты постов
- Получение списка друзей и заявок
- Загрузку истории сообщений
- Подсчет непрочитанных сообщений

**Ожидаемое улучшение производительности: от 20x до 100x для различных запросов**

## Для локальной разработки

### Вариант 1: Применить миграцию (рекомендуется)

```bash
# Остановить контейнеры
docker-compose down

# Запустить снова (миграции применятся автоматически)
docker-compose up -d

# Проверить логи
docker logs mooza-api
```

### Вариант 2: Применить вручную

```bash
# Применить миграцию в работающем контейнере
docker exec mooza-api npx prisma migrate deploy

# Или войти в контейнер
docker exec -it mooza-api sh
npx prisma migrate deploy
exit
```

## Для VPS (Production)

### Через скрипт deploy.sh (рекомендуется)

```bash
# На вашем компьютере (Windows/Linux/Mac)
# Скрипт автоматически применит все миграции
./deploy.sh YOUR_VPS_IP
```

### Вручную на VPS

```bash
# Подключитесь к VPS
ssh root@YOUR_VPS_IP

# Перейдите в директорию проекта
cd /root/mooza_dev

# Обновите код
git pull origin main

# Применить миграции
docker exec mooza-api npx prisma migrate deploy

# Проверить логи
docker logs mooza-api
```

## Проверка применения индексов

### Через Prisma Studio

```bash
# Локально
docker exec -it mooza-api npx prisma studio

# На VPS
ssh root@YOUR_VPS_IP
docker exec -it mooza-api npx prisma studio
```

### Через PostgreSQL

```bash
# Подключиться к базе данных
docker exec -it mooza-postgres psql -U mooza -d mooza_db

# Посмотреть все индексы
\di

# Посмотреть индексы конкретной таблицы
\d "User"

# Посмотреть размеры индексов
SELECT
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes
JOIN pg_class ON indexname = relname
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

# Выйти
\q
```

## Проверка производительности

### До и после индексов

```sql
-- Включить отображение времени выполнения
\timing on

-- Тестовый запрос: поиск пользователей по городу
EXPLAIN ANALYZE SELECT * FROM "User" WHERE city = 'Moscow';

-- Должно показать использование индекса:
-- Index Scan using User_city_idx on "User"
```

### Примеры запросов для тестирования

```sql
-- Поиск по email (должен использовать User_email_idx)
EXPLAIN ANALYZE SELECT * FROM "User" WHERE email = 'test@example.com';

-- Посты пользователя (должен использовать Post_authorId_idx)
EXPLAIN ANALYZE SELECT * FROM "Post" WHERE "authorId" = 'some-user-id' ORDER BY "createdAt" DESC;

-- Непрочитанные сообщения (должен использовать Message_receiverId_readAt_idx)
EXPLAIN ANALYZE SELECT * FROM "Message" WHERE "receiverId" = 'some-user-id' AND "readAt" IS NULL;

-- Друзья пользователя (должен использовать Friendship_receiverId_status_idx)
EXPLAIN ANALYZE SELECT * FROM "Friendship" WHERE "receiverId" = 'some-user-id' AND status = 'accepted';
```

## Откат (если что-то пошло не так)

### Откатить последнюю миграцию

```bash
# Локально
docker exec mooza-api npx prisma migrate resolve --rolled-back 20260202214000_add_missing_indexes

# На VPS
ssh root@YOUR_VPS_IP
docker exec mooza-api npx prisma migrate resolve --rolled-back 20260202214000_add_missing_indexes
```

### Удалить индексы вручную

```sql
-- Подключиться к базе
docker exec -it mooza-postgres psql -U mooza -d mooza_db

-- Удалить индексы (пример)
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "User_city_idx";
-- и т.д.
```

## Мониторинг после применения

### Проверить использование индексов

```sql
-- Статистика использования индексов
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Найти неиспользуемые индексы

```sql
-- Индексы, которые никогда не использовались
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
    AND schemaname = 'public'
    AND indexrelid IS NOT NULL
ORDER BY pg_relation_size(indexrelid) DESC;
```

## Дополнительная информация

- Полная документация по индексам: [`DATABASE_INDEXES.md`](DATABASE_INDEXES.md)
- История изменений: [`CHANGELOG.md`](CHANGELOG.md)
- Схема базы данных: [`server/prisma/schema.prisma`](server/prisma/schema.prisma)

## Поддержка

Если возникли проблемы:
1. Проверьте логи: `docker logs mooza-api`
2. Проверьте статус миграций: `docker exec mooza-api npx prisma migrate status`
3. Создайте issue в репозитории с описанием проблемы

---

**Важно**: Индексы занимают дополнительное место на диске и немного замедляют операции INSERT/UPDATE, но значительно ускоряют SELECT запросы. Для приложения с большим количеством чтения (как социальная сеть) это критически важно.
