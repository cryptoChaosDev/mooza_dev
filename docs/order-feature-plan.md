# План реализации фичи «Заказ» (Order) — DEV

Заказ зеркалит «Услугу» (`UserService`), но создаётся заказчиком. Все имена моделей/роутов/компонентов — из реального кода (проверено агентами).

**Важно (флаг сделок):** `client/src/lib/features.ts` → `DEALS_ENABLED = false`. Кнопка «Оформить сделку» в блоке «Отклики» делается ПОД `DEALS_ENABLED` (бэкенд-эндпоинт готов всегда; кнопка скрыта, пока флаг выключен — консистентно с услугами).

---

## 1. Данные (Prisma) — `server/prisma/schema.prisma`

**Решение:** раздел каталога = `serviceId` FK на справочную `Service`; фильтры-атрибуты = M2M `selectedCustomFilterValues CustomFilterValue[]` (как у `UserService` — даёт прямую совместимость с поиском исполнителей). Референсы — отдельные модели файлов и ссылок (нужны id для удаления и `SUM(size)` для лимита 20МБ).

Добавить в конец schema.prisma:
```prisma
model Order {
  id          String  @id @default(uuid())
  authorId    String
  serviceId   String
  title       String
  titleNorm   String?         // GENERATED в миграции, никогда не пишется
  budgetFrom  Int?
  budgetTo    Int?
  deadline    DateTime?       // null = «Срок не ограничен»
  description String?
  status      String   @default("active")  // active | archived | draft
  author  User    @relation("OrderAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  service Service @relation(fields: [serviceId], references: [id])
  selectedCustomFilterValues CustomFilterValue[]
  referenceFiles OrderReferenceFile[]
  referenceLinks OrderReferenceLink[]
  responses      OrderResponse[]
  posts          Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([authorId])
  @@index([serviceId])
  @@index([status])
  @@index([deadline])
}

model OrderResponse {
  id        String  @id @default(uuid())
  orderId   String
  executorId String
  price     Int
  comment   String?
  createdAt DateTime @default(now())
  order    Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  executor User  @relation("OrderResponder", fields: [executorId], references: [id], onDelete: Cascade)
  @@unique([orderId, executorId])
  @@index([orderId])
}

model OrderReferenceFile {
  id           String  @id @default(uuid())
  orderId      String
  url          String
  originalName String
  size         Int
  mimeType     String?
  order        Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  createdAt    DateTime @default(now())
  @@index([orderId])
}

model OrderReferenceLink {
  id        String   @id @default(uuid())
  orderId   String
  url       String
  title     String   @default("")
  source    String   // yandex_disk | google_docs | dropbox | youtube
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@index([orderId])
}
```
Обратные связи на существующих моделях:
- `User`: `orders Order[] @relation("OrderAuthor")`, `orderResponses OrderResponse[] @relation("OrderResponder")`.
- `Service` (справочная): `orders Order[]`.
- `CustomFilterValue`: `orders Order[]`.
- `Post`: `orderId String?` + `order Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)` + `@@index([orderId])` (по образцу `serviceId`/`service`).

**Миграция** `server/prisma/migrations/20260618000000_orders/migration.sql` (проект использует `prisma migrate deploy`, НЕ `db push`):
- `CREATE TABLE "Order"` без `titleNorm`, затем `ALTER TABLE "Order" ADD COLUMN "titleNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("title", '')), 'ё', 'е')) STORED;` (образец — миграция `20260603000000_yo_insensitive_search`).
- `CREATE TABLE` для OrderResponse, OrderReferenceFile, OrderReferenceLink.
- Неявная M2M join-таблица Prisma `_CustomFilterValueToOrder` (CREATE TABLE + 2 FK + 2 уникальных индекса — форму скопировать у существующей join-таблицы `UserService↔CustomFilterValue`).
- Все индексы и FK (CASCADE / SET NULL).
- `ALTER TABLE "Post" ADD COLUMN "orderId" TEXT;` + index + FK ON DELETE SET NULL.
- НЕ применять `prisma db push` (сломает GENERATED titleNorm → поиск опустеет). Только migrate.

## 2. API — новый `server/src/routes/orders.ts` (+ регистрация)

Импорты: `{ authenticate, optionalAuthenticate, AuthRequest }` из `../middleware/auth`; `prisma` из `../index`; `notify` из `../utils/notify`; `uploadOrderMedia` из `../middleware/upload`. Образцы: `deals.ts` (55-117), `users.ts` services (624-776).

В `server/src/index.ts`: `import orderRoutes from './routes/orders';` + `app.use('/api/orders', orderRoutes);` (после строки 182).

**Multer** в `server/src/middleware/upload.ts`: `uploadOrderMedia` по образцу `uploadPostMedia` (138-172): папка `uploads/orders/`, фильтр картинки (jpeg/jpg/png/gif/webp) + аудио (mpeg/mp3/wav/x-wav/ogg/flac/mp4/x-m4a/aac), `limits.fileSize: 20*1024*1024`. Суммарный лимит набора (20МБ) проверять в роуте: `SUM(OrderReferenceFile.size where orderId)` + новые.

Эндпоинты (все мутации — author = req.userId, иначе 404):
- `POST /api/orders` `{ title(≤50,обяз), serviceId(обяз), budgetFrom?, budgetTo?, deadline?(ISO|null), description?, customFilterValueIds?:string[], status?:'active'|'draft', referenceLinks?:[{url,title,source}], referenceFileIds?:string[] }` → создаёт Order; `selectedCustomFilterValues:{connect:ids.map(id=>({id}))}`; привязывает referenceFileIds; создаёт referenceLinks. Если `status='active'` → создать пост: `prisma.post.create({data:{type:'order',authorId,orderId,title,content:description||''}})`. Вернуть с include (service.section, selectedCustomFilterValues, referenceFiles, referenceLinks, _count.responses).
- `PATCH /api/orders/:id` — частичное обновление; фильтры через `set`+`connect`. Если стал active и поста нет — создать; синхронизировать описание/бюджет в связанный пост.
- `PATCH /api/orders/:id/status` `{status}` — ручная смена (active|archived|draft). draft/archived→active = «Опубликовать» (создать пост если нет). Зеркало `PATCH /me/services/:serviceId/status` (users.ts 722-737).
- `DELETE /api/orders/:id`.
- `GET /api/orders/mine?status=` — «Мои заказы» автора (компактные поля + счётчики).
- `GET /api/orders/:id` (optionalAuthenticate) — полный заказ + responses (executor: id/имя/avatar) + `isOwner`. Не-автору доступен только если есть опубликованный пост заказа.
- `GET /api/orders/:id/matches?page&limit` (optionalAuthenticate) — «Подходящие исполнители»: тот же поиск, что `references/search`, по `serviceId` + `selectedCustomFilterValues` (id) + budget→price. **Фолбэк-каскад:** пусто → без customFilterValueIds → без price → без serviceId. Вернуть `{results, fallbackLevel}` (fallbackLevel:'empty' → клиент рисует заглушку).
- `POST /api/orders/:id/responses` `{price(обяз,число), comment?}` — нельзя на свой заказ; upsert по `@@unique`. `notify(order.authorId, type:'order_response', ...)`.
- `GET /api/orders/:id/responses` — список (для блока «Отклики»), author only.
- `POST /api/orders/:id/offer` `{executorId}` — «Предложить заказ». `notify(executorId, type:'order_offered', ...)`.
- `POST /api/orders/:id/responses/:responseId/deal` — «Оформить сделку»: создать Deal по логике `deals.ts POST /` (customer=order.authorId=req.userId, executor=response.executorId, title=order.title, price=response.price, dealType:'process', deadline=order.deadline||null). Несколько сделок на заказ ОК. Вернуть `{deal}`.
- `POST /api/orders/:id/references` (multipart `uploadOrderMedia.array('files')`) — проверить суммарный ≤20МБ; создать OrderReferenceFile (url:/uploads/orders/<filename>).
- `DELETE /api/orders/:id/references/:fileId` — удалить строку + файл с диска.

**Scheduler** `server/src/scheduler.ts`: `processOrderDeadlines()` по образцу `processDealTimeouts` (14-145): `order.findMany({where:{status:'active', deadline:{lt:now, not:null}}})` → каждый `update status:'archived'` + локальный `notify(authorId,'order_auto_archived','Срок выполнения заказа истёк','Срок выполнения заказа «<title>» истёк. Заказ перемещён в архив.','/orders/<id>')`. Вызвать в `run()` внутри `startScheduler` после `processDealTimeouts()`. (Локальный notify уже есть в scheduler.ts 5-12.)

## 3. Поток — тип публикации `order`

`server/src/routes/posts.ts`: в include постов (feed + single, ~470-480) добавить `order:{select:{id,title,budgetFrom,budgetTo,deadline,service:{select:{name,section:{select:{name}}}}}}` рядом с `service`. Фильтр `where.type='order'` уже работает (feed-хендлер ~151-170). Пост создаётся из orders.ts (не из POST /posts).

`client/src/pages/FeedPage.tsx`: в `POST_TYPE_META` (665-675) добавить `order:{label:'Заказ', icon:Briefcase, accent:'border-l-2 border-rose-500/60', badge:'bg-rose-500/10 text-rose-400 border-rose-500/20'}`. Рядом со строкой 237 — `const order = post.type==='order' && post.order ? post.order : null;`. После блока карточки услуги (~520) — рендер карточки заказа: Название, Раздел (`order.service?.section?.name`), Бюджет (от/до → «от X ₽ до Y ₽»; оба null → «По договорённости»), Срок (`deadline ? toLocaleDateString('ru-RU') : 'Срок не ограничен'`), сокращ. описание. Кнопки **«Посмотреть детали»** → `navigate('/orders/'+order.id)` и **«Написать»** → `navigate('/messages/'+post.author.id)`. Кнопки «Откликнуться» в карточке НЕТ. В `POST_TYPE_OPTIONS` (679-685) тип «Заказ» НЕ добавлять (создаётся из профиля).

## 4. Уведомления (модель Notification.type — свободная строка)
- `order_offered` (POST /offer): userId=executor, «Вам предложили заказ» / «[Имя автора] предложил(-а) вам заказ «[title]»» / `/orders/:id`.
- `order_response` (POST /responses): userId=author, «Отклик на заказ» / «[Имя исполнителя] откликнулся на заказ «[title]»» / `/orders/:id`.
- `order_auto_archived` (scheduler): userId=author, «Срок выполнения заказа истёк» / «...перемещён в архив.» / `/orders/:id`.
Клиент рендерит title/body/link универсально — правок в NotificationBell не нужно.

## 5. Клиент

**`client/src/lib/api.ts`** — `orderAPI` (рядом с `dealAPI` ~584):
```ts
export const orderAPI = {
  getMine: (params?: { status?: string }) => api.get('/orders/mine', { params }),
  getOne: (id: string) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  update: (id: string, data: any) => api.patch(`/orders/${id}`, data),
  setStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/orders/${id}`),
  getMatches: (id: string, params?: { page?: number; limit?: number }) => api.get(`/orders/${id}/matches`, { params }),
  respond: (id: string, data: { price: number; comment?: string }) => api.post(`/orders/${id}/responses`, data),
  getResponses: (id: string) => api.get(`/orders/${id}/responses`),
  offer: (id: string, executorId: string) => api.post(`/orders/${id}/offer`, { executorId }),
  createDeal: (id: string, responseId: string) => api.post(`/orders/${id}/responses/${responseId}/deal`, {}),
  uploadReferences: (id: string, formData: FormData) => api.post(`/orders/${id}/references`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteReference: (id: string, fileId: string) => api.delete(`/orders/${id}/references/${fileId}`),
};
```
Переиспользовать `referenceAPI.getSections/getServiceDetail/searchMusicians` для формы и подходящих исполнителей.

**Форма заказа** — `OrderForm()` в `ProfilePage.tsx`, зеркало `ServiceForm()` (867-1125). Состояние `OrderEntry` по образцу `UserServiceEntry` (65-106): serviceId/serviceName, serviceCustomFilters, customFilterValueIds, + title, budgetFrom, budgetTo, deadlineEnabled, deadlineDate (ДД.ММ.ГГГГ), description, references(files+links), status. Выбор раздела = тот же autocomplete + getSections()+getServiceDetail() (910-963), **без автоподтягивания фильтров из профиля** (пропустить ownedFilterValueTexts из 620-659). Фильтры single/мультиселект (isLevelFilter→single). Бюджет от/до (оба пусты→«По договорённости»). Срок: тоггл «Указать срок» + дата (выкл→«Срок не ограничен»). Описание textarea без лимита. Референсы: загрузчик файлов (паттерн handlePortfolioUpload — картинки+аудио, сумма ≤20МБ на клиенте) + список ссылок «+Добавить ссылку» с выбором источника. Кнопка «Опубликовать» → create({status:'active'}). **Тихое автосохранение черновика** по паттерну услуги (171-249): на unmount/закрытие если есть значимые данные и не было «Отмены»/«Опубликовать» → create/update({status:'draft'}).

**Блок «Мои заказы»** в ProfilePage рядом с «Мои сделки» (1753+) и «Услуги» (1687+): слайдер плиток (образец «Услуги» 1703-1747), заголовок «Мои заказы» + счётчик активных + «Посмотреть все» → `navigate('/orders')`. Первая плитка «Добавить» (Plus) → OrderForm. Плитки: Название / Раздел (`order.service.section.name`) / Срок. `useQuery(['orders','mine'], () => orderAPI.getMine())`. Пусто → только «Добавить».

**Страница «Все заказы»** — `client/src/pages/OrdersPage.tsx` (новый): вкладки Активные/В архиве/Черновики. Плитка: Название/Раздел/Срок. Кнопки: Активный→«Редактировать»/«В архив»(setStatus archived); Черновик/Архив→«Редактировать»/«Опубликовать»(setStatus active).

**Страница заказа** — `client/src/pages/OrderDetailPage.tsx` (новый, lazy). Автору: полное описание/бюджет/срок/референсы (картинки превью, аудио — плеер; ссылки список), кнопка «В архив». Блок **«Подходящие исполнители»** (`getMatches`): карточка (имя/avatar/город/профессии) кликабельна → `/profile/:id`; кнопка «Предложить заказ» → `offer(id,userId)`. Блок **«Отклики»** (`getResponses`): имя/цена/коммент; «Написать» → `/messages/:executorId`; «Оформить сделку» (ПОД `DEALS_ENABLED`) → `createDeal` → `/deals/:dealId`. Пустые состояния: `matches.fallbackLevel==='empty'` → заглушка «Заказ уже виден всей платформе» (подпись, ссылка «Посмотреть заказ в Потоке», ссылка «Пригласить специалиста по ссылке» (referralAPI), пояснение). Не-автору (вход из Потока «Посмотреть детали» / уведомления «Вам предложили заказ»): полный вид + кнопка **«Откликнуться»** → форма отклика (Цена обяз. + Комментарий) → `respond(id,{price,comment})`.

**Роуты** `client/src/App.tsx`: `const OrdersPage = lazy(()=>import('./pages/OrdersPage'))`, `const OrderDetailPage = lazy(()=>import('./pages/OrderDetailPage'))`, `<Route path="/orders" element={<OrdersPage/>}/>`, `<Route path="/orders/:orderId" element={<OrderDetailPage/>}/>` (рядом с deals-роутами 183-184). Учесть гейтинг: эти роуты — для залогиненных (в дереве с token).

## 6. Последовательность (минимум конфликтов файлов)
**Backend-слой (агент A):** schema.prisma (+ обратные связи) → migration.sql → upload.ts (uploadOrderMedia) → scheduler.ts → orders.ts (все эндпоинты) → index.ts (регистрация) → posts.ts (order include).
**Frontend новые файлы + api (агент B):** api.ts (orderAPI) → OrderDetailPage.tsx → OrdersPage.tsx.
**Frontend интеграция (агент C):** FeedPage.tsx (карточка заказа) → App.tsx (роуты) → ProfilePage.tsx (OrderForm + блок «Мои заказы»).
Файлы A/B/C не пересекаются → можно параллельно. Контракт — этот документ (точные имена эндпоинтов/orderAPI/типов).

## 7. Краевые случаи
- DEALS_ENABLED: «Оформить сделку» гейтить флагом (бэк готов всегда).
- Откликов — по одному от исполнителя (upsert). Сделок — без ограничений.
- Тихий черновик: только при unmount + значимые данные; явные «Опубликовать»/«Отмена» не порождают draft (ref-флаги как у услуги).
- Авто-архив: только active + deadline not null + lt now; идемпотентно.
- Права: мутации — только author (404 иначе); GET для не-автора — только при опубликованном посте; нельзя откликнуться на свой заказ.
- Пустые состояния: фолбэк-каскад matches; полная пустота → заглушка.
- Дедлайн ДД.ММ.ГГГГ → парсить в ISO (полночь UTC) на отправке.
- Бюджет оба пусты → «По договорённости»; deadline null → «Срок не ограничен» (везде).
