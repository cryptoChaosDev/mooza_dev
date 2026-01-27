# Инструкция по развертыванию на VPS

## Проблемы, которые были исправлены:

1. **PostgreSQL был открыт в интернет** - злоумышленники сканировали порт 5432
2. **Неправильный VITE_API_URL** - клиент пытался подключиться к localhost вместо IP/домена сервера
3. **Использовались dev-режимы** вместо production

## 🚀 Быстрое развертывание (рекомендуется)

Для быстрого развертывания используйте автоматизированные скрипты:

### Шаг 1: Первоначальная настройка VPS (один раз)

```bash
# Загрузите проект на VPS
git clone <your-repo> /opt/mooza
cd /opt/mooza

# Сделайте скрипты исполняемыми
chmod +x *.sh

# Запустите настройку VPS (требуется sudo)
sudo ./setup-vps.sh
```

Скрипт установит:
- Docker и Docker Compose
- Файрвол UFW с правильными настройками
- Nginx (опционально)
- Certbot для SSL (опционально)
- Дополнительные утилиты

### Шаг 2: Развертывание приложения

```bash
# Запустите скрипт развертывания
./deploy.sh
```

Скрипт:
1. Запросит IP адрес или домен вашего сервера
2. Автоматически сгенерирует безопасный JWT_SECRET
3. Создаст правильную конфигурацию docker-compose.prod.yml
4. Соберет и запустит все контейнеры
5. Проверит работоспособность

Готово! 🎉

## 📋 Доступные скрипты

После развертывания у вас будут доступны следующие скрипты:

### `setup-vps.sh` - Первоначальная настройка VPS
Устанавливает Docker, настраивает файрвол, создает директории.

```bash
sudo ./setup-vps.sh
```

### `deploy.sh` - Развертывание/обновление приложения
Главный скрипт для развертывания или обновления приложения.

```bash
./deploy.sh
```

### `backup.sh` - Создание бэкапа базы данных
Создает бэкап PostgreSQL базы данных.

```bash
./backup.sh
```

### `restore.sh` - Восстановление из бэкапа
Восстанавливает базу данных из бэкапа.

```bash
./restore.sh
```

### `logs.sh` - Просмотр логов
Интерактивный просмотр логов различных сервисов.

```bash
./logs.sh
```

## 🔧 Ручное развертывание (альтернатива)

Если вы предпочитаете ручную настройку:

### 1. Подготовка

На вашем VPS выполните:

```bash
# Установите Docker и Docker Compose
sudo apt update
sudo apt install docker.io docker-compose -y
sudo systemctl start docker
sudo systemctl enable docker

# Клонируйте проект
cd /opt
git clone <your-repo> mooza
cd mooza
```

### 2. Настройка переменных окружения

Откройте `docker-compose.prod.yml` и измените:

```yaml
# В секции web -> environment:
- VITE_API_URL=http://YOUR_SERVER_IP_OR_DOMAIN:4000
```

Замените на:
- Ваш IP: `http://123.45.67.89:4000`
- Или домен: `http://mooza.ru:4000`

**ВАЖНО**: Также измените JWT_SECRET на случайную строку:

```bash
# Создайте .env файл в корне проекта
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env
```

И в `docker-compose.prod.yml`:
```yaml
api:
  environment:
    JWT_SECRET: ${JWT_SECRET}  # Используется из .env
```

### 3. Запуск

```bash
# Остановите старые контейнеры (если есть)
docker-compose down

# Пересоберите и запустите с production конфигурацией
docker-compose -f docker-compose.prod.yml up -d --build

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs -f
```

### 4. Проверка

```bash
# Проверьте, что контейнеры запущены
docker ps

# Должны быть:
# - mooza-postgres (порт 5432 НЕ пробрасывается наружу)
# - mooza-api (порт 4000)
# - mooza-web (порт 3000)

# Проверьте health check API
curl http://localhost:4000/health

# Должно вернуть: {"status":"ok","timestamp":"..."}
```

### 5. Настройка файрвола (ВАЖНО!)

```bash
# Разрешите только нужные порты
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Веб-приложение
sudo ufw allow 4000/tcp  # API

# НЕ открывайте порт 5432 (PostgreSQL)!

sudo ufw enable
sudo ufw status
```

### 6. Доступ к приложению

- Веб-интерфейс: `http://YOUR_IP:3000`
- API: `http://YOUR_IP:4000`

## Рекомендации для production

### 1. Используйте Nginx как reverse proxy

Создайте `/etc/nginx/sites-available/mooza`:

```nginx
server {
    listen 80;
    server_name mooza.ru www.mooza.ru;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Активируйте:
```bash
sudo ln -s /etc/nginx/sites-available/mooza /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Тогда в `docker-compose.prod.yml` измените:
```yaml
- VITE_API_URL=http://mooza.ru/api  # Без порта!
```

### 2. Настройте SSL с Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mooza.ru -d www.mooza.ru
```

И измените на HTTPS:
```yaml
- VITE_API_URL=https://mooza.ru/api
```

### 3. Измените пароли базы данных

В `docker-compose.prod.yml` замените дефолтные `mooza123` на безопасные пароли.

## Отладка

### Проверка логов

```bash
# Все логи
docker-compose -f docker-compose.prod.yml logs -f

# Только API
docker-compose -f docker-compose.prod.yml logs -f api

# Только PostgreSQL
docker-compose -f docker-compose.prod.yml logs -f postgres

# Только веб
docker-compose -f docker-compose.prod.yml logs -f web
```

### Вход в контейнер

```bash
# API
docker exec -it mooza-api sh

# PostgreSQL
docker exec -it mooza-postgres psql -U mooza -d mooza_db
```

### Перезапуск

```bash
# Перезапустить все
docker-compose -f docker-compose.prod.yml restart

# Перезапустить только API
docker-compose -f docker-compose.prod.yml restart api
```

### Обновление кода

```bash
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

## Безопасность

1. ✅ PostgreSQL НЕ доступен из интернета
2. ✅ Используются production builds
3. ⚠️  Смените JWT_SECRET на случайное значение
4. ⚠️  Смените пароль БД на безопасный
5. ⚠️  Настройте HTTPS (см. выше)
6. ⚠️  Настройте регулярные бэкапы БД

## 💾 Бэкапы

### Создание бэкапа (автоматизированный способ)

```bash
./backup.sh
```

Скрипт:
- Создаст бэкап базы данных с временной меткой
- Предложит сжать бэкап с помощью gzip
- Может автоматически удалить старые бэкапы (>7 дней)

### Восстановление из бэкапа

```bash
./restore.sh
```

Скрипт:
- Покажет доступные бэкапы
- Создаст страховочный бэкап перед восстановлением
- Восстановит выбранный бэкап

### Ручное управление бэкапами

```bash
# Создать бэкап вручную
docker exec mooza-postgres pg_dump -U mooza mooza_db > backup_$(date +%Y%m%d).sql

# Восстановить из бэкапа
cat backup_20260127.sql | docker exec -i mooza-postgres psql -U mooza mooza_db
```

### Автоматические бэкапы (cron)

Добавьте в crontab для ежедневных бэкапов:

```bash
# Открыть crontab
crontab -e

# Добавить строку (бэкап каждый день в 3:00 ночи)
0 3 * * * cd /opt/mooza && ./backup.sh
```

## 📊 Мониторинг

### Просмотр логов

```bash
# Интерактивный просмотр
./logs.sh

# Или напрямую
docker-compose -f docker-compose.prod.yml logs -f
```

### Статистика ресурсов

```bash
# Статистика контейнеров
docker stats

# Использование дискового пространства
docker system df

# Детальная информация о volumes
docker volume ls
docker volume inspect mooza_postgres_data
```

### Проверка здоровья сервисов

```bash
# Статус контейнеров
docker ps

# Health check API
curl http://localhost:4000/health

# Проверка PostgreSQL
docker exec mooza-postgres pg_isready -U mooza
```

## 🔄 Обновление приложения

После обновления кода в git:

```bash
# Скачать обновления
git pull

# Пересобрать и перезапустить
./deploy.sh

# Или вручную
docker-compose -f docker-compose.prod.yml up -d --build
```

## 🛠️ Устранение неполадок

### Контейнеры не запускаются

```bash
# Проверьте логи
./logs.sh

# Проверьте статус
docker ps -a

# Пересоздайте контейнеры
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### База данных недоступна

```bash
# Проверьте статус PostgreSQL
docker exec mooza-postgres pg_isready -U mooza

# Проверьте логи PostgreSQL
docker-compose -f docker-compose.prod.yml logs postgres

# Перезапустите PostgreSQL
docker-compose -f docker-compose.prod.yml restart postgres
```

### API возвращает ошибки

```bash
# Проверьте логи API
docker-compose -f docker-compose.prod.yml logs api

# Проверьте переменные окружения
docker exec mooza-api env | grep -E "DATABASE_URL|JWT_SECRET"

# Перезапустите API
docker-compose -f docker-compose.prod.yml restart api
```

### Очистка Docker

```bash
# Удалить неиспользуемые ресурсы
docker system prune -a

# Удалить все контейнеры и volumes (ОСТОРОЖНО!)
docker-compose -f docker-compose.prod.yml down -v
```

## 📞 Полезные контакты и ссылки

- **Docker документация**: https://docs.docker.com/
- **PostgreSQL документация**: https://www.postgresql.org/docs/
- **Nginx документация**: https://nginx.org/ru/docs/
- **Let's Encrypt**: https://letsencrypt.org/

---

Создано для Mooza Music Social Network 🎵
