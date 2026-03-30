# Moooza — Обзор проекта

Moooza — это социальная сеть для музыкантов и людей из музыкальной индустрии. Пользователи создают профиль, указывают профессию, оказываемые услуги и фильтры к ним (жанр, формат работы, ценовой диапазон и т.д.), находят друг друга через поиск, переписываются в чате и публикуют посты в ленте.

Продакшн: **https://www.moooza.ru** (VPS 147.45.166.246)

---

## Стек технологий

| Слой | Технология |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, TailwindCSS 3, Framer Motion |
| Роутинг | React Router v6 |
| Серверное состояние | TanStack Query v5 |
| Клиентское состояние | Zustand v5 |
| HTTP-клиент | Axios |
| Real-time | Socket.io v4 (клиент + сервер) |
| PWA | vite-plugin-pwa (Workbox) |
| Backend | Node.js, Express 4, TypeScript |
| ORM | Prisma 5 |
| База данных | PostgreSQL 16 |
| Авторизация | JWT (jsonwebtoken) |
| Загрузка файлов | Multer |
| Безопасность | Helmet, CORS whitelist, express-rate-limit |
| Логирование | Winston + Morgan |
| Валидация | Zod |
| Контейнеризация | Docker + Docker Compose |
| Веб-сервер | Nginx (reverse proxy + SSL termination) |
| SSL | Let's Encrypt / Certbot |

---

## Структура монорепозитория

```
mooza_dev/
├── client/                  # React-приложение
│   ├── src/
│   │   ├── App.tsx          # Роутинг, WebSocket-подключение, badge-логика
│   │   ├── main.tsx         # Точка входа, ErrorBoundary, QueryClientProvider
│   │   ├── pages/           # Страницы (см. ниже)
│   │   ├── components/      # Переиспользуемые компоненты
│   │   ├── stores/          # Zustand-сторы
│   │   ├── lib/             # socket.ts и прочие утилиты
│   │   └── constants/       # Константы (API_URL и др.)
│   ├── Dockerfile
│   └── vite.config.ts       # Vite + PWA-конфиг
│
├── server/                  # Express API
│   ├── src/
│   │   ├── index.ts         # Инициализация сервера
│   │   ├── socket.ts        # Socket.io (чат, уведомления)
│   │   ├── routes/          # REST-маршруты (см. ниже)
│   │   ├── middleware/      # auth, rateLimiter
│   │   └── utils/           # jwt, logger
│   ├── prisma/
│   │   ├── schema.prisma    # Модели БД
│   │   └── seed.ts          # Заполнение справочников
│   └── Dockerfile
│
├── nginx/
│   └── moooza.ru.conf       # Шаблон конфига Nginx
│
├── docker-compose.prod.yml  # Продакшн-оркестрация
├── docker-compose.yml       # Локальная разработка
└── deploy.sh                # Скрипт деплоя
```

---

## Страницы (client/src/pages/)

| Файл | Путь | Описание |
|---|---|---|
| `LandingPage.tsx` | `/landing` | Публичная лендинг-страница |
| `LoginPage.tsx` | `/login` | Вход по email + пароль |
| `RegisterPage.tsx` | `/register` | Регистрация |
| `FeedPage.tsx` | `/` | Лента постов |
| `ProfilePage.tsx` | `/profile` | Редактирование своего профиля |
| `UserProfilePage.tsx` | `/profile/:userId` | Профиль другого пользователя |
| `SearchPage.tsx` | `/search` | Поиск пользователей по фильтрам |
| `FriendsPage.tsx` | `/friends` | Заявки в друзья, список друзей |
| `MessagesPage.tsx` | `/messages` | Список диалогов |
| `ChatPage.tsx` | `/messages/:userId` | Чат с конкретным пользователем |
| `AdminPage.tsx` | `/admin` | Панель администратора |

Все страницы — code-split через `React.lazy` + `Suspense`.

---

## Компоненты (client/src/components/)

| Файл | Назначение |
|---|---|
| `Layout.tsx` | Общая обёртка: хедер, нижняя навигация |
| `BottomNav.tsx` | Мобильная нижняя панель с бейджами |
| `NotificationBell.tsx` | Колокольчик уведомлений в хедере |
| `ProfessionSelector.tsx` | Выбор профессии (3 уровня: сфера → направление → профессия) |
| `FeatureSelector.tsx` | Чип-селектор особенностей профессии |
| `MultiLevelSearch.tsx` | Поиск с вложенной иерархией |
| `FilterPanel.tsx` | Панель фильтров поиска |
| `SelectField.tsx` / `SelectSheet.tsx` | Кастомные select-компоненты |
| `ChipGroup.tsx` | Группа чипов для множественного выбора |
| `PriceInputGroup.tsx` | Выбор ценового диапазона |
| `BottomSheet.tsx` | Мобильный bottom sheet |

---

## Zustand-сторы (client/src/stores/)

| Файл | Назначение |
|---|---|
| `authStore.ts` | JWT-токен, данные текущего пользователя, флаг авторизации |
| `badgeStore.ts` | Счётчики бейджей: непрочитанные сообщения, заявки в друзья, уведомления |
| `searchStore.ts` | Состояние фильтров поиска |

**Важно:** `badgeStore` используется через `useBadgeStore.getState()` в колбэках App.tsx (без подписки компонента), чтобы не вызывать лишних ре-рендеров.

---

## API-маршруты (server/src/routes/)

| Файл | Префикс | Основные эндпоинты |
|---|---|---|
| `auth.ts` | `/api/auth` | POST /register, POST /login |
| `users.ts` | `/api/users` | GET /me, PATCH /me, GET /:id, PATCH /services, POST /avatar, POST /banner |
| `posts.ts` | `/api/posts` | CRUD постов, лайки, комментарии |
| `friendships.ts` | `/api/friendships` | Заявки в друзья, принять/отклонить, список друзей |
| `messages.ts` | `/api/messages` | История сообщений, пометить прочитанными |
| `notifications.ts` | `/api/notifications` | Список уведомлений, пометить прочитанными |
| `references.ts` | `/api/references` | Справочники: сферы, направления, профессии, сервисы, жанры и т.д. |
| `admin.ts` | `/api/admin` | Управление пользователями (только isAdmin) |

Все защищённые маршруты используют JWT middleware из `middleware/auth.ts`.
Лимит запросов: `express-rate-limit` на `/api/`.

---

## База данных (Prisma schema)

### Иерархия профессий (справочники)

```
FieldOfActivity  (сфера деятельности)
  └── Direction  (направление)
        └── Profession  (профессия)
              └── Service  (услуга)
```

### Услуги пользователя

`UserService` — основная таблица, связывающая пользователя с его услугами.
К каждой записи UserService прикреплены многие-ко-многим фильтры:

- `Genre` — музыкальный жанр
- `WorkFormat` — формат работы (онлайн / офлайн и т.д.)
- `EmploymentType` — тип занятости
- `SkillLevel` — уровень мастерства
- `Availability` — доступность
- `Geography` — география (город/регион)
- `PriceRange` — ценовой диапазон (дискретные бакеты, напр. "До 5 000 ₽")

### Социальные функции

| Модель | Назначение |
|---|---|
| `User` | Основная сущность пользователя |
| `Post` | Пост в ленте |
| `Like` | Лайк поста (уникальный userId+postId) |
| `Comment` | Комментарий к посту |
| `Message` | Личное сообщение (sender → receiver) |
| `Friendship` | Связь дружбы (статусы: pending / accepted / rejected) |
| `Notification` | Уведомление (тип: message / friend_request / friend_accepted / post_reply) |
| `PortfolioFile` | Файлы портфолио пользователя |
| `Artist` | Артист/группа (many-to-many с User через UserArtist) |
| `Employer` | Работодатель (many-to-one с User) |

---

## Real-time (Socket.io)

Сервер инициализируется в `server/src/socket.ts`.
Клиент подключается в `App.tsx` при логине через `connectSocket(token)`.

**События:**
- `new_message` — новое личное сообщение → обновление чата + бейдж + браузерное уведомление
- `new_notification` — уведомление о лайке, комментарии, заявке в друзья → бейдж + браузерное push

---

## Инфраструктура и деплой

### Docker Compose (продакшн)

Три контейнера в изолированной сети `mooza-network`:

```
postgres (порт 5432 — только внутри сети)
  ↓
api      (порт 4000 → пробрасывается на хост)
  ↓
web      (порт 3000 → пробрасывается на хост)
```

При старте `api`-контейнера автоматически применяются Prisma-миграции (`prisma migrate deploy`).
Аватары и баннеры хранятся в bind-mount `./server/uploads`.

### Nginx (на хосте VPS)

Обратный прокси для всего трафика:

```
moooza.ru / www.moooza.ru
  ├── /api/*       → localhost:4000  (Express API)
  ├── /socket.io/* → localhost:4000  (WebSocket upgrade)
  └── /*           → localhost:3000  (React SPA)
```

SSL-сертификат Let's Encrypt управляется Certbot.
Максимальный размер загрузки — 20 МБ (`client_max_body_size 20M`).

### PWA

Приложение зарегистрировано как PWA через `vite-plugin-pwa` (Workbox).
Service worker прекеширует JS, CSS, иконки, шрифты — но **не** `index.html`,
чтобы после деплоя браузер всегда получал актуальный HTML с новыми хешами бандлов.
Навигационные запросы обрабатываются через `navigateFallback: '/index.html'`.

---

## Загрузка файлов

Аватары и баннеры загружаются через `POST /api/users/avatar` и `POST /api/users/banner`.
Multer сохраняет файлы в `server/uploads/avatars/` и `server/uploads/banners/`.
Файлы отдаются статически: `GET /uploads/<path>`.

---

## Переменные окружения

| Переменная | Где используется | Описание |
|---|---|---|
| `DATABASE_URL` | server | PostgreSQL connection string |
| `JWT_SECRET` | server | Секрет для подписи токенов |
| `PORT` | server | Порт API (по умолчанию 4000) |
| `ALLOWED_ORIGINS` | server | CORS whitelist (через запятую) |
| `NODE_ENV` | server | `production` / `development` |
| `VITE_API_URL` | client (build-time) | Базовый URL API |
