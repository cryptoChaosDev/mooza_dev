# 🔧 Быстрое исправление для VPS

## Проблема
- База данных "mooza" не существует (должна быть "mooza_db")
- Таблицы не созданы (Prisma миграции не запущены)

## ✅ Решение

### На Windows (локальная машина):

```bash
# 1. Закоммитьте исправления
git add .
git commit -m "Fix database name and add Prisma migrations"
git push origin main
```

### На VPS:

```bash
# 1. Подключитесь по SSH
ssh your-username@your-vps-ip

# 2. Перейдите в директорию проекта
cd /opt/mooza

# 3. Обновите код
git pull

# 4. Остановите и удалите старые контейнеры
docker-compose -f docker-compose.prod.yml down -v

# 5. Удалите старую конфигурацию
rm -f docker-compose.prod.yml .env

# 6. Заново разверните приложение
./deploy.sh

# 7. Проверьте логи
docker-compose -f docker-compose.prod.yml logs -f
```

## Что исправлено:

1. ✅ **Healthcheck PostgreSQL** теперь проверяет правильную БД: `mooza_db`
2. ✅ **Добавлена команда для миграций**: `npx prisma migrate deploy`
3. ✅ **Исправлено в обоих файлах**: `docker-compose.yml` и `deploy.sh`

## После исправления:

При запуске вы должны увидеть в логах:

```
mooza-api | Running migrations...
mooza-api | Applying migration `20231201_init`
mooza-api | Database migrations completed successfully
mooza-api | 🚀 Server running on http://localhost:4000
```

И регистрация/вход должны работать! 🎉

## Если возникают проблемы:

```bash
# Проверьте логи API
docker-compose -f docker-compose.prod.yml logs api

# Проверьте логи PostgreSQL
docker-compose -f docker-compose.prod.yml logs postgres

# Войдите в контейнер API и проверьте БД вручную
docker exec -it mooza-api sh
npx prisma migrate status
```
