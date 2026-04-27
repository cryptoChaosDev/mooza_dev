# 🎵 Mooza - Современная Платформа для Музыкантов

Mooza - это современный мобильный веб-сервис для поиска музыкальных партнеров, коллабораций и общения между музыкантами, продюсерами, битмейкерами и вокалистами.

## ✨ Основные возможности

- 🔐 **Аутентификация**: Регистрация и вход с JWT токенами
- 👤 **Профили**: Создание и редактирование профилей с указанием роли, навыков, жанров
- 🔍 **Поиск**: Продвинутый поиск музыкантов по городу, роли, жанру
- 👥 **Друзья**: Система заявок в друзья и управление контактами
- 📱 **Mobile First**: Оптимизировано для мобильных устройств
- 🎨 **Современный UI**: Темная тема, Tailwind CSS

## 🛠 Технологический стек

### Backend
- **Node.js 20** + **TypeScript**
- **Express.js** - REST API
- **Prisma ORM** - работа с БД
- **PostgreSQL 16** - база данных
- **JWT** - аутентификация
- **bcrypt** - хеширование паролей

### Frontend
- **React 18** + **TypeScript**
- **Vite** - быстрая сборка
- **Tailwind CSS** - стилизация
- **Zustand** - управление состоянием
- **React Query** - работа с API
- **React Router v6** - навигация

### DevOps
- **Docker** + **Docker Compose**
- **PostgreSQL** в контейнере
- Hot reload для разработки

## 📚 Документация

> **📖 Полный индекс документации**: См. [DOCS_INDEX.md](DOCS_INDEX.md) для навигации по всей документации проекта

## 🚀 Быстрый старт

> **📦 Развертывание на VPS?** См. [VPS_QUICK_START.md](VPS_QUICK_START.md) или [WINDOWS_DEPLOY_GUIDE.md](WINDOWS_DEPLOY_GUIDE.md)  
> **⚡ Оптимизация производительности?** См. [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md)

### Требования
- Docker Desktop
- Docker Compose

### Локальная разработка

1. **Клонируйте репозиторий**
```bash
git clone https://github.com/cryptoChaosDev/mooza_dev.git
cd mooza_dev
```

2. **Запустите все сервисы**
```bash
docker-compose up -d --build
```

3. **Проверьте статус**
```bash
docker ps
```

Вы должны увидеть 3 запущенных контейнера:
- `mooza-postgres` - база данных (порт 5432)
- `mooza-api` - backend API (порт 4000)
- `mooza-web` - frontend (порт 3000)

4. **Откройте приложение**
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Health check: http://localhost:4000/health

### Остановка сервисов

```bash
docker-compose down
```

### Очистка данных

```bash
docker-compose down -v  # Удалит все данные из БД
```

## 📁 Структура проекта

```
mooza_dev/
├── server/                 # Backend API
│   ├── src/
│   │   ├── routes/        # API маршруты
│   │   ├── middleware/    # Middleware (auth)
│   │   └── index.ts       # Точка входа
│   ├── prisma/            # Prisma схема и миграции
│   ├── Dockerfile
│   └── package.json
│
├── client/                # Frontend приложение
│   ├── src/
│   │   ├── components/   # React компоненты
│   │   ├── pages/        # Страницы
│   │   ├── stores/       # Zustand stores
│   │   ├── lib/          # API клиент
│   │   └── App.tsx       # Главный компонент
│   ├── Dockerfile.dev
│   └── package.json
│
└── docker-compose.yml     # Docker orchestration
```

## 🔌 API Endpoints

### Аутентификация
```
POST /api/auth/register   - Регистрация нового пользователя
POST /api/auth/login      - Вход в систему
```

### Пользователи
```
GET    /api/users/me           - Получить текущего пользователя
PUT    /api/users/me           - Обновить профиль
GET    /api/users/search       - Поиск пользователей
GET    /api/users/:id          - Получить пользователя по ID
```

### Друзья
```
GET    /api/friendships              - Список друзей
GET    /api/friendships/requests     - Заявки в друзья
POST   /api/friendships              - Отправить заявку
PUT    /api/friendships/:id/accept   - Принять заявку
DELETE /api/friendships/:id          - Удалить/отклонить заявку
```

## 🔧 Разработка

### Backend

**Просмотр логов:**
```bash
docker logs -f mooza-api
```

**Выполнение команд в контейнере:**
```bash
docker exec -it mooza-api sh
```

**Создание миграции:**
```bash
docker exec mooza-api npx prisma migrate dev --name your_migration_name
```

**Prisma Studio (GUI для БД):**
```bash
docker exec -it mooza-api npx prisma studio
```

### Frontend

**Просмотр логов:**
```bash
docker logs -f mooza-web
```

**Установка зависимостей:**
```bash
docker exec mooza-web npm install <package-name>
```

### База данных

**Подключение к PostgreSQL:**
```bash
docker exec -it mooza-postgres psql -U mooza -d mooza_db
```

**Полезные SQL команды:**
```sql
\dt              -- Список таблиц
\d users         -- Структура таблицы users
SELECT * FROM users;  -- Все пользователи
```

**Документация по индексам:**
См. [`DATABASE_INDEXES.md`](DATABASE_INDEXES.md) для полной информации об индексах базы данных и оптимизации производительности.

## 🎨 Основные компоненты

### Страницы
- `/` - Главная страница
- `/login` - Вход
- `/register` - Регистрация
- `/profile` - Профиль пользователя
- `/search` - Поиск музыкантов
- `/friends` - Друзья и заявки

### Роли музыкантов
- Продюсер
- Вокалист
- Битмейкер
- Композитор
- Саунд-дизайнер
- Диджей
- Звукорежиссер

## 🔐 Переменные окружения

### Backend (.env)
```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://mooza:mooza123@postgres:5432/mooza_db
JWT_SECRET=your-secret-key-change-in-production
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:4000
```

## 📝 Примеры использования API

### Регистрация
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "firstName": "Иван",
    "lastName": "Иванов"
  }'
```

### Вход
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### Получение профиля
```bash
curl http://localhost:4000/api/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🐛 Отладка

**Проблемы с запуском:**
```bash
# Пересоздать контейнеры
docker-compose up -d --build --force-recreate

# Очистить кеш Docker
docker system prune -a

# Проверить логи всех сервисов
docker-compose logs
```

**Проблемы с БД:**
```bash
# Пересоздать БД с нуля
docker-compose down -v
docker-compose up -d
docker exec mooza-api npx prisma migrate dev
```

## 🌐 Развертывание на VPS

### Быстрое развертывание

Если вы работаете с Windows и хотите развернуть на VPS:

1. **На Windows:** Читайте [WINDOWS_DEPLOY_GUIDE.md](WINDOWS_DEPLOY_GUIDE.md)
2. **На VPS (Linux):** Читайте [VPS_QUICK_START.md](VPS_QUICK_START.md)

### Автоматизированные скрипты

Проект включает скрипты для автоматического развертывания:

- `setup-vps.sh` - Первоначальная настройка VPS (Docker, UFW, Nginx)
- `deploy.sh` - Автоматическое развертывание приложения
- `backup.sh` - Создание бэкапов базы данных
- `restore.sh` - Восстановление из бэкапа
- `logs.sh` - Интерактивный просмотр логов

Подробное описание: [SCRIPTS_README.md](SCRIPTS_README.md)

### Что исправлено для VPS:

✅ PostgreSQL защищен от интернета (порт 5432 не открыт)
✅ Правильная настройка API URL для клиента
✅ Production builds вместо dev-режимов
✅ Автоматическая генерация безопасных паролей
✅ Готовые скрипты для SSL/HTTPS

## 📄 Лицензия

Copyright (c) 2026 Anton Semin and Dmitry Dubrovin
All rights reserved.
This code is proprietary and confidential.
Unauthorized copying, distribution, or use is strictly prohibited.

## 👥 Команда

Разработано для коммьюнити музыкантов

---

**Готово к использованию! 🎉**

Откройте http://localhost:3000 и начните использовать Mooza!
