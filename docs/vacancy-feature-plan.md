# Фича «Вакансия» — контракт реализации

Вакансия = публичное предложение Артиста (post-MVP: Компании) на постоянное/проектное
сотрудничество по ЛЮБОЙ профессии (каталог профессий). Структурно — аналог «Заказа», но:
автор = **Артист**, каталог = **профессии**, мэтчинг = **профессия + фильтры профессии**
(обязательно) с сортировкой по **статусу занятости**, отклик = комментарий + портфолио
(без цены), оффер = отдельная модель с accept/reject. Шаблон для клонирования — фича Order
(`server/src/routes/orders.ts`, `client/src/components/OrderForm.tsx`, `OrderDetailPage`,
`OrdersPage`, блок «Мои заказы», карточка заказа в FeedPage).

Статусы: `active` (опубликована, в ленте) · `draft` (черновик) · `archived` (в архиве, остаётся
в ленте с плашкой «В архиве», как заказ). Дедлайна нет.

---

## 0. Ключевые решения (развилки закрыты)

1. **Каталог — профессии**, поле `professionId` (НЕ serviceId). Форма тянет фильтры через
   `GET /api/references/professions/:id/filters` (`referenceAPI.getProfessionFilters`). Раздел
   (профессия) выбирается из каталога профессий: `referenceAPI.getProfessions()` / существующий
   список профессий (узнать точный метод; если нет «секций» — плоский список/поиск профессий).
2. **Автор — Артист**. `Vacancy.artistId` (владеющий артист) + `Vacancy.authorId` (человек-владелец,
   на момент создания — для откликов/«Написать»/notify). Создание/правка гейтятся проверкой
   `prisma.userArtist.findFirst({ where:{ userId, artistId, isOwner:true, inviteStatus:'ACCEPTED' } })`.
3. **Мэтчинг**: кандидаты — резиденты с подходящей профессией+фильтрами (обязательно), затем
   сортировка по `occupancyStatus` (open/considering → null/'' → closed последними). Резидентских
   полей формат/гео/занятость/оплата нет — буст по ним не делаем (отметить как будущее).
4. **Редактирование** разрешено в ЛЮБОМ статусе (ТЗ 13: «Редактировать» есть на всех вкладках) —
   guard «только черновик» НЕ ставим. Правка активной вакансии ре-синкает её пост.
5. **Архив** оставляет пост в ленте с плашкой «В архиве» (зеркало заказа). Перевод в черновик —
   удаляет пост.

---

## 1. БД — модели (server/prisma/schema.prisma) + миграция

ВАЖНО (память project_dev_norm_columns): `titleNorm` — GENERATED-колонка, создаётся СЫРОЙ
миграцией, НЕ через `prisma db push`. Пишем `server/prisma/migrations/20260620000000_vacancies/migration.sql`
(CREATE TABLE без titleNorm → ALTER ADD COLUMN titleNorm ... GENERATED ALWAYS AS
(translate(lower(coalesce("title",'')),'ё','е')) STORED). Применяю на DEV через `prisma db execute --file`.

```prisma
model Vacancy {
  id            String   @id @default(uuid())
  artistId      String
  authorId      String                       // owner-человек (для откликов/notify/«Написать»)
  professionId  String
  title         String
  titleNorm     String?                      // GENERATED (миграция)
  workFormat    String                       // online|offline|hybrid
  geography     String                       // city|region|country|international
  employmentType String                      // permanent|partial|project|intern|volunteer
  paymentType   String                       // free|respect|barter|percent|rate
  compensation  Int?                         // только для percent|rate
  description   String?
  requireComment   Boolean @default(false)
  requirePortfolio Boolean @default(false)
  status        String   @default("active")  // active|archived|draft
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  artist     Artist  @relation(fields: [artistId], references: [id], onDelete: Cascade)
  author     User    @relation("VacancyAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  profession Profession @relation(fields: [professionId], references: [id], onDelete: Restrict)
  selectedCustomFilterValues CustomFilterValue[]
  referenceFiles VacancyReferenceFile[]
  referenceLinks VacancyReferenceLink[]
  responses  VacancyResponse[]
  offers     VacancyOffer[]
  posts      Post[]
  @@index([artistId]) @@index([authorId]) @@index([professionId]) @@index([status])
}

model VacancyResponse {
  id          String  @id @default(uuid())
  vacancyId   String
  applicantId String
  comment     String?
  createdAt   DateTime @default(now())
  vacancy   Vacancy @relation(fields: [vacancyId], references: [id], onDelete: Cascade)
  applicant User    @relation("VacancyApplicant", fields: [applicantId], references: [id], onDelete: Cascade)
  portfolioFiles VacancyResponseFile[]
  portfolioLinks VacancyResponseLink[]
  offers    VacancyOffer[]
  @@unique([vacancyId, applicantId]) @@index([vacancyId])
}

model VacancyOffer {
  id          String  @id @default(uuid())
  vacancyId   String
  responseId  String
  applicantId String
  startDate   DateTime
  conditions  String                          // описание условий
  compensation String                         // вознаграждение (свободный ввод)
  extraDetails String?
  status      String   @default("pending")    // pending|accepted|rejected
  createdAt   DateTime @default(now())
  vacancy   Vacancy @relation(fields: [vacancyId], references: [id], onDelete: Cascade)
  response  VacancyResponse @relation(fields: [responseId], references: [id], onDelete: Cascade)
  applicant User    @relation("VacancyOfferApplicant", fields: [applicantId], references: [id], onDelete: Cascade)
  @@index([vacancyId]) @@index([applicantId])
}

model VacancyReferenceFile { id String @id @default(uuid()) vacancyId String url String originalName String size Int mimeType String? createdAt DateTime @default(now()) vacancy Vacancy @relation(fields:[vacancyId],references:[id],onDelete:Cascade) @@index([vacancyId]) }
model VacancyReferenceLink { id String @id @default(uuid()) vacancyId String url String title String @default("") source String createdAt DateTime @default(now()) vacancy Vacancy @relation(fields:[vacancyId],references:[id],onDelete:Cascade) @@index([vacancyId]) }
model VacancyResponseFile { id String @id @default(uuid()) responseId String url String originalName String size Int mimeType String? createdAt DateTime @default(now()) response VacancyResponse @relation(fields:[responseId],references:[id],onDelete:Cascade) @@index([responseId]) }
model VacancyResponseLink { id String @id @default(uuid()) responseId String url String title String @default("") source String createdAt DateTime @default(now()) response VacancyResponse @relation(fields:[responseId],references:[id],onDelete:Cascade) @@index([responseId]) }
```

Back-relations (добавить в существующие модели):
- `Artist`: `vacancies Vacancy[]`
- `User`: `vacancies Vacancy[] @relation("VacancyAuthor")`, `vacancyResponses VacancyResponse[] @relation("VacancyApplicant")`, `vacancyOffers VacancyOffer[] @relation("VacancyOfferApplicant")`
- `Profession`: `vacancies Vacancy[]`
- `CustomFilterValue`: `vacancies Vacancy[]`
- `Post`: `vacancyId String?` + `vacancy Vacancy? @relation(fields:[vacancyId],references:[id],onDelete:SetNull)` + `@@index([vacancyId])`

Миграция: CREATE TABLE для всех 6 моделей; `titleNorm` как GENERATED; implicit M2M join
`_CustomFilterValueToVacancy` (A=CustomFilterValue, B=Vacancy: алфавитно CustomFilterValue<Vacancy)
с FK + `_AB_unique` + `_B_index`; `Post.vacancyId` + FK SetNull + index. Все строковые
enum-поля — просто String (валидируются в роуте).

---

## 2. Бэкенд — server/src/routes/vacancies.ts (mount `/api/vacancies` в index.ts)

Константы: `MAX_REFERENCES_BYTES=20MB`, `VALID_STATUS=Set(active,draft,archived)`,
`VALID_WORK_FORMAT=Set(online,offline,hybrid)`, `VALID_GEOGRAPHY=Set(city,region,country,international)`,
`VALID_EMPLOYMENT=Set(permanent,partial,project,intern,volunteer)`, `VALID_PAYMENT=Set(free,respect,barter,percent,rate)`.

Хелперы:
- `assertArtistOwner(userId, artistId)` → `userArtist.findFirst({where:{userId,artistId,isOwner:true,inviteStatus:'ACCEPTED'}})`; null → 403.
- `syncVacancyPost(vacancyId, artistId, authorId, title, description)` → find-or-create
  `post` where `{vacancyId,type:'vacancy'}`; create `{type:'vacancy', artistId, authorId, vacancyId, title, content:description||''}`.
- `VACANCY_INCLUDE`: profession{id,name}, selectedCustomFilterValues{id,value,filter{id,name}},
  referenceFiles asc, referenceLinks asc, artist{id,name,avatar}, _count{responses}.
- `VACANCY_MINE_SELECT`: id,title,status,workFormat,paymentType,createdAt, profession{id,name}, _count{responses}.

Эндпоинты (метод · путь · авторизация · поведение):
1. `POST /` (auth) — body `{artistId,professionId,title,workFormat,geography,employmentType,paymentType,compensation?,description?,customFilterValueIds[],requireComment,requirePortfolio,status,referenceLinks[]}`. `assertArtistOwner`. Валидация: title+professionId+4 single-select обязательны и в VALID_*; compensation только если payment∈{percent,rate} (иначе null). status: VALID_STATUS иначе 'draft'. create Vacancy (title slice 100), connect CFV ids, create referenceLinks. Если status==='active' → syncVacancyPost. 201 + full.
2. `PATCH /:id` (auth, owner) — частичное обновление любых полей (БЕЗ guard статуса). CFV `{set:[],connect}`. referenceLinks `{deleteMany,create}`. Если итоговый status==='active' → syncVacancyPost (ре-синк заголовка/описания).
3. `PATCH /:id/status` (auth, owner) — body{status}∈VALID. active→syncVacancyPost; draft→`post.deleteMany({vacancyId,type:'vacancy'})`; archived→оставить пост. 200 full.
4. `DELETE /:id` (auth, owner) — unlink файлов с диска, delete (cascade).
5. `GET /mine?artistId=&status=` (auth) — `assertArtistOwner(userId,artistId)`; where{artistId,status?}; VACANCY_MINE_SELECT; orderBy updatedAt desc. (artist-scoped, НЕ authorId.)
6. `GET /:id` (optionalAuth) — VACANCY_INCLUDE + responses{applicant{id,firstName,lastName,avatar}, portfolioFiles, portfolioLinks, offers}. isOwner = me===authorId. Не-владелец видит только если есть опубликованный пост (`post where {vacancyId,type:'vacancy'}`), иначе 404. Вернуть {...rest, isOwner, responses: isOwner?…:undefined, myResponse: (не-владелец) свой отклик с офферами или null}.
7. `GET /:id/matches?page&limit` (optionalAuth) — мэтчинг (раздел 4). 5 на страницу по умолчанию.
8. `POST /:id/responses` (auth) — body{comment?, portfolioLinks[]}. Нельзя откликаться на свою (author===me → 400). Нужен опубликованный пост. Валидация требований: если vacancy.requireComment и нет comment → 400; (портфолио проверяем по наличию ссылок ИЛИ файлов — файлы грузятся отдельным запросом, поэтому requirePortfolio проверять мягко на финальном шаге клиента; сервер: если requirePortfolio и нет ни ссылок, ни уже загруженных файлов → 400). upsert по {vacancyId_applicantId}. notify(author, 'vacancy_response', 'Отклик на вакансию', `${name} откликнулся на вакансию «${title}»`, `/vacancies/${id}`). 201.
9. `POST /:id/responses/:responseId/portfolio` (auth, uploadVacancyMedia.array('files'), applicant-only — владелец отклика) — лимит 20MB суммарно на отклик. create VacancyResponseFile. 201.
10. `DELETE /:id/responses/:responseId/portfolio/:fileId` (auth, applicant-only).
11. `GET /:id/responses` (auth, owner) — все отклики desc с applicant + portfolio + offers.
12. `POST /:id/offer` (auth, owner) — «Предложить вакансию» подходящему кандидату (из matches, ДО отклика). body{candidateId}. notify(candidateId,'vacancy_offered','Вам предложили вакансию', `${artistName} предлагает вакансию «${title}»`, `/vacancies/${id}`). 200 {ok}.
13. `POST /:id/responses/:responseId/cooperation` (auth, owner) — оффер о сотрудничестве «Выбрать кандидата». body{startDate,conditions,compensation,extraDetails?}. Валидация обязательных. create VacancyOffer{vacancyId,responseId,applicantId:response.applicantId,...,status:'pending'}. notify(applicant,'vacancy_cooperation_offer','Предложение о сотрудничестве', `По вакансии «${title}» вам предложили сотрудничество`, `/vacancies/${vacancyId}`). 201 {offer}. (Можно несколько офферов по разным откликам.)
14. `POST /vacancies/offers/:offerId/accept` (auth, applicant-only) — set offer.status='accepted'. notify(vacancy.authorId,'vacancy_offer_accepted', 'Предложение принято', `${name} принял предложение по вакансии «${title}»`, `/vacancies/${vacancyId}`). 200 {offer, vacancyId}.
15. `POST /vacancies/offers/:offerId/reject` (auth, applicant-only) — set offer.status='rejected'. notify(authorId,'vacancy_offer_rejected', 'Предложение отклонено', …, link). 200.
16. `POST /:id/references` (auth, owner, uploadVacancyMedia.array('files')) — как у заказа (20MB суммарно). url=`/uploads/vacancies/${filename}`.
17. `DELETE /:id/references/:fileId` (auth, owner).

upload.ts: `uploadVacancyMedia` → `uploads/vacancies` (auto-mkdir), те же типы/лимиты, что uploadOrderMedia (image jpeg/png/gif/webp + audio mp3/wav/flac/ogg/…), filename `vacancy-...`.

posts.ts: в `buildFeedInclude()` И в single-post include добавить
`vacancy: { select: { id,title,workFormat,geography,paymentType,compensation,status, profession:{ select:{ name } } } }`. (Карточка ленты показывает профессию/формат/оплату/гео.)

---

## 3. Поля формы (ТЗ 4.1) — single-select значения (русские лейблы)

- workFormat: online «Онлайн», offline «Офлайн», hybrid «Гибрид».
- geography: city «В своём городе», region «В своём регионе», country «По всей стране», international «Международная занятость».
- employmentType: permanent «Постоянная», partial «Частичная (совмещение)», project «Проектная», intern «Стажёр», volunteer «Волонтёр».
- paymentType: free «Бесплатно», respect «За респект», barter «Бартер», percent «Процент», rate «Ставка».
- compensation: числовой ввод, виден ТОЛЬКО при paymentType∈{percent,rate}.
Все 4 single-select — обязательные. Хранить эти константы в общем модуле клиента
`client/src/lib/vacancyOptions.ts` (id+label массивы), переиспользовать в форме/деталях/карточке.

---

## 4. Мэтчинг кандидатов (эндпоинт 7)

Загрузить vacancy с selectedCustomFilterValues{id,filterId}. Сгруппировать cfvIds по filterId →
`groupClauses(gs)=gs.map(g=>({selectedCustomFilterValues:{some:{id:{in:g.ids}}}}))`.
Базовый where кандидата (резидента):
```
userWhere = { id:{not: vacancy.authorId},
  userProfessions: { some: { professionId: vacancy.professionId, AND: groupClauses(allGroups) } } }
```
Профессия — ОБЯЗАТЕЛЬНА (без неё в список не попадают). Если фильтров нет — просто
`userProfessions:{some:{professionId}}`. Каскад релаксации (как orders, но по профессии):
`full` (профессия+все группы) → `no_filters` (только профессия). Пусто на обоих → fallbackLevel 'empty'.
Брать `take` с запасом, затем в JS **сортировать по occupancyStatus**: rank open=0, considering=0,
''/null=1, closed=2 (ТЗ 3.4); внутри ранга — по createdAt desc. Пагинация по 5 поверх отсортированного
(достаточно: загрузить, скажем, до 200 совпавших, отсортировать, нарезать страницу).
userSelect: id,firstName,lastName,nickname,avatar,city,occupancyStatus, userProfessions{profession{name}}.
shape: `{ id, user:{...}, occupancyStatus, professions:[names] }`. На карточке кандидата показываем
статус занятости (Не указан/Рассматриваю/Открыт/Закрыт).

---

## 5. Клиент — vacancyAPI (client/src/lib/api.ts)

```
vacancyAPI = {
  getMine: ({artistId,status})=>GET /vacancies/mine?artistId&status,
  getOne: (id)=>GET /vacancies/:id,
  create: (data)=>POST /vacancies,
  update: (id,data)=>PATCH /vacancies/:id,
  setStatus: (id,status)=>PATCH /vacancies/:id/status,
  remove: (id)=>DELETE /vacancies/:id,
  getMatches: (id,{page,limit})=>GET /vacancies/:id/matches,
  respond: (id,{comment,portfolioLinks})=>POST /vacancies/:id/responses,
  uploadPortfolio: (id,responseId,formData)=>POST /vacancies/:id/responses/:responseId/portfolio,
  deletePortfolio: (id,responseId,fileId)=>DELETE …,
  getResponses: (id)=>GET /vacancies/:id/responses,
  offerCandidate: (id,candidateId)=>POST /vacancies/:id/offer {candidateId},
  makeCooperation: (id,responseId,data)=>POST /vacancies/:id/responses/:responseId/cooperation,
  acceptOffer: (offerId)=>POST /vacancies/offers/:offerId/accept,
  rejectOffer: (offerId)=>POST /vacancies/offers/:offerId/reject,
  uploadReferences: (id,formData)=>POST /vacancies/:id/references,
  deleteReference: (id,fileId)=>DELETE /vacancies/:id/references/:fileId,
}
```

---

## 6. VacancyForm (client/src/components/VacancyForm.tsx) — клон OrderForm

Проп: `{ onClose, vacancy?, artistId? }`. `isEdit=!!vacancy`. Если `artistId` не передан (вход из
Потока) — показать селектор «От имени артиста» (список владельческих артистов через
`GET /api/posts/my-authors` → `postAPI.getMyAuthors()` или существующий метод; если 1 — авто-выбор;
если 0 — заглушка «Создайте артиста, чтобы публиковать вакансии»). artistId обязателен для submit.

Поля (раздел 3): Название (≤100), Раздел=Профессия (каталог профессий, поиск), Фильтры профессии
(getProfessionFilters(professionId) → чипы, multi; группировка как в OrderForm filterSel),
Формат работы / География / Тип занятости / Тип оплаты (4 single-select из vacancyOptions),
Размер вознаграждения (число, виден при percent/rate), Описание, Материалы (файлы+ссылки —
как refLinks/refFiles/existingFiles в OrderForm), 2 тоггла (Комментарий обязателен / Портфолио
обязательно). Кнопка «Опубликовать» (+ «В черновики»/«Сохранить черновик» как в OrderForm).
buildPayload(status) → {artistId, professionId, title, workFormat, geography, employmentType,
paymentType, compensation:(percent|rate? num:null), description, customFilterValueIds:Object.values(filterSel).flat(),
requireComment, requirePortfolio, referenceLinks, status}. Тихий автосейв-черновик на unmount — как
OrderForm (в edit-режиме отключён). Submit: isEdit?update:create → uploadRefs → invalidate
['vacancies','mine',artistId] (+['vacancy',id] если edit).

Профессия-каталог: проверить методы referenceAPI для списка профессий (getProfessions/ getDirections
→ professions). Если плоского списка нет — использовать поиск профессий, который уже есть в каталоге
людей (MultiLevelSearch/references). Реализатор выбирает существующий источник профессий.

---

## 7. VacancyDetailPage (client/src/pages/VacancyDetailPage.tsx) — клон OrderDetailPage

`useQuery ['vacancy',id] getOne`. Шапка/карточка: профессия, формат/гео/занятость/оплата(+compensation),
описание, материалы (изображения/аудио/ссылки), плашка «В архиве» при archived.

**Вид владельца (isOwner):**
- Кнопки статуса (ТЗ 13): active → [Редактировать(открыть VacancyForm vacancy=…), В архив]; draft → [Редактировать, Опубликовать]; archived → [Редактировать, Опубликовать]. («Редактировать» доступен всегда.)
- Блок «Подходящие кандидаты»: useInfiniteQuery getMatches(limit 5) + «Показать больше». Каждый
  кандидат: аватар, имя (клик→/profile/:id), профессии, **бейдж статуса занятости** (Не указан/Рассматриваю/
  Открыт/Закрыт), кнопка «Предложить вакансию»→offerCandidate. Пусто (fallbackLevel==='empty') → заглушка
  как у заказа (вакансия видна всей платформе + автообновление).
- Блок «Отклики» (getResponses): для каждого — имя, комментарий, портфолио (ссылки+файлы),
  кнопки «Написать»→/messages/:applicantId и «Выбрать кандидата»→форма оффера о сотрудничестве
  (модалка: Дата начала(date), Описание условий(textarea), Вознаграждение(text), Доп.детали(textarea),
  все кроме доп.деталей обязательны → makeCooperation). Можно несколько офферов.
- **Архив-промпт**: если есть оффер со status==='accepted' и vacancy.status==='active' — показать
  ConfirmDialog «Архивировать вакансию?» (Да→setStatus('archived'); Нет→скрыть, client-state «dismissed»).

**Вид соискателя (не владелец, резидент):**
- «Написать»→/messages/:authorId (до отклика — ТЗ 11).
- «Откликнуться» → форма отклика (Комментарий + Портфолио файлы+ссылки). Обязательность по
  vacancy.requireComment/requirePortfolio (блокировать отправку + тост). Submit: respond → если файлы,
  uploadPortfolio. После отклика — показать свой отклик.
- Если по моему отклику есть оффер о сотрудничестве (myResponse.offers, status pending) — карточка
  оффера (дата/условия/вознаграждение/детали) + кнопки «Принять»(acceptOffer)/«Отклонить»(rejectOffer).

---

## 8. VacanciesPage (client/src/pages/VacanciesPage.tsx) «Все вакансии» — клон OrdersPage

Маршрут `/artists/:artistId/vacancies` (artist-scoped). Вкладки Активные/В архиве/Черновики.
`getMine({artistId, status:tab})`. Карточка-плитка: Название, Профессия, Формат работы. Матрица кнопок
(ТЗ 13): active→[Редактировать, В архив]; draft→[Редактировать, Опубликовать]; archived→[Редактировать,
Опубликовать]. «Редактировать» → getOne → открыть VacancyForm(vacancy=…, artistId).

---

## 9. Лента (client/src/pages/FeedPage.tsx + FlowSettingsPage.tsx)

- POST_TYPE_META.vacancy уже есть (amber, Briefcase). Поменять иконку на отличную от Order (напр.
  `Megaphone` или `UserPlus`), чтобы не путать с заказом.
- POST_TYPE_OPTIONS: добавить `{type:'vacancy', label:'Вакансия', icon:…, desc:'Поиск в команду', inDev:false}`.
  Выбор «Вакансия» в пикере «Создать пост» → открыть VacancyForm БЕЗ artistId (он сам спросит артиста).
- Карточка вакансии в ленте (зеркало карточки заказа): `const vacancy = post.type==='vacancy' && post.vacancy ? post.vacancy : null;`
  Поля: Название, Профессия (vacancy.profession.name), Формат работы (лейбл из vacancyOptions),
  Условия=Тип оплаты (лейбл), География (лейбл), краткое описание (line-clamp). Плашка «В архиве» при
  status==='archived'. Кнопка ТОЛЬКО «Посмотреть детали»→/vacancies/:id. БЕЗ «Написать»/«Откликнуться».
  Обновить «голые» content-гарды (`!svc && !order` → `&& !vacancy`).
- FlowSettingsPage POST_TYPES: добавить `{id:'vacancy', label:'Вакансия'}` (фильтр уже идёт в where.type).

---

## 10. ArtistPage «Мои вакансии» (client/src/pages/ArtistPage.tsx)

Вставить блок-слайдер «Мои вакансии» (зеркало «Мои заказы» из ProfilePage) рядом с owner-секциями
(после media-rail релизов/клипов), гейт рендера на `viewerIsAdmin`, кнопок публикации/«Добавить» на
`viewerIsOwner`. Данные: `useQuery(['vacancies','mine',artistId], ()=>vacancyAPI.getMine({artistId:id}))`.
Заголовок: счётчик активных + «Посмотреть все»→`/artists/${id}/vacancies`. Первая плитка «Добавить» →
открыть VacancyForm(artistId=id). Плитка вакансии: Название, Профессия, Формат работы → /vacancies/:id.
Пустое состояние — только плитка «Добавить».

---

## 11. App.tsx — маршруты

lazy `VacanciesPage`, `VacancyDetailPage`. Routes: `/artists/:artistId/vacancies`→VacanciesPage,
`/vacancies/:vacancyId`→VacancyDetailPage. (Создание — через VacancyForm-модалку, отдельного route нет.)

---

## 12. Проверка
- `cd server && npx tsc --noEmit` → 0; `cd client && npx tsc --noEmit` → 0.
- Миграция применяется на DEV (таблицы существуют; titleNorm GENERATED).
- Smoke: создать вакансию (артист-владелец) → появляется в ленте (тип vacancy) + в «Мои вакансии» →
  страница вакансии: matches (резиденты по профессии), отклик резидента, оффер о сотрудничестве,
  accept→архив-промпт.
