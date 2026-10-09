# План: «Moooza доступна без регистрации» (гостевой режим + SEO-снимки)

Дата: 2026-10-09. Статус: **утверждён** (2026-10-09).

Дополнительные решения владельца (2026-10-09):
- AI-краулеры (GPTBot, ClaudeBot, PerplexityBot и т.п.) — **разрешены**.
- Сбор согласий у существующих пользователей — **карточка в профиле + разовое окно** (не чаще раза в 30 дней, не больше 3 раз).
- Человекочитаемые адреса — **делаем сейчас, для артистов** (`/artist/:slug`, 301 со старых `/artist/<uuid>`). Это часть Ф4, примерно +2 дня. Вариант «отложить слаги» из п. 0.6 и D больше не действует.
- Обезличивание людей без согласия и контакты, скрытые от гостей, — подтверждены, они следуют из исходных решений.

Решения владельца:
- Гостю на просмотр доступны: артисты, релизы и клипы; профили и услуги; лента; заказы и вакансии.
- Личные профили публичны только при согласии на публичное распространение ПДн (`publicConsentAt`, 152-ФЗ ст. 10.1).
- Все действия и контакты доступны только после входа (через AuthGate).
- SEO делаем серверными снимками и динамическим sitemap, без полного SSR.

## 0. Ключевые решения
1. **Одно дерево роутов** вместо двух (`if (!token)` в App.tsx). У каждого маршрута свой уровень: `public` / `public-limited` / `private` / `guest-only`. Приватный маршрут гостю показывает «Войдите, чтобы…» и запоминает URL для возврата после входа. Редиректа на `/` больше нет.
2. **Гостевые ответы собираются сервером по белому списку полей.** Делает это новый модуль `server/src/lib/publicData.ts`. Он общий для JSON-эндпоинтов (ветка `if (!req.userId)`) и для SEO-снимков. Объект, собранный для авторизованного, через `...rest` никогда не отдаётся гостю.
3. **Люди без согласия обезличиваются.** Просто убрать ссылку недостаточно: имя и фото без ссылки — это всё равно распространение ПДн.
   - Посты таких авторов скрыты из гостевой ленты. Исключения: посты от имени артиста, заказы (подпись «Заказчик на Moooza»), вакансии (подпись — артист).
   - Составы артистов и титры: показываем только людей с согласием, остальные — строкой «и ещё N участников — после входа», id не отдаём.
   - Авторы отзывов без согласия подписаны «Пользователь Moooza».
   - Комментарии гостю не показываются, только их число.
4. **SEO-снимки.** nginx внутри web-контейнера (`client/nginx.conf`, лежит в git) проксирует публичные пути на `api:4000/seo/render…`. Если api не отвечает, отдаётся обычный `index.html` (503). Шаблон берётся из настоящего `dist/index.html`, поэтому хеши ассетов всегда совпадают. Host-nginx не трогаем (кроме 301 www→apex).
5. **Sitemap динамический** (`/sitemap*.xml` проксируется на api). robots.txt остаётся статикой. DEV — noindex через env-страховку.
6. **Слаги в URL пока не делаем.** Вернёмся к ним через 2–3 месяца по данным Вебмастера.
7. **Аварийные выключатели:** `SiteSetting.guestBrowsingEnabled` (гостевой режим) и env `SEO_SNAPSHOTS` (снимки). Порядок включения: гостевой режим → снимки → открытие robots/sitemap.

## 0.1. Блокеры в текущем коде (Ф0)
| # | Где | Проблема |
|---|---|---|
| 1 | `users.ts` `publicUserSelect` (GET `/:id`, `/handle/:handle`) | Отдаются `notificationPrefs`, `isBlocked`, `lastSeenAt`, `birthDate`, `proUntil`, `avgResponseMinutes` |
| 2 | `users.ts` GET `/:id/services`, `/user-service/:id` | Черновики и архив видны всем |
| 3 | `artists.ts` GET `/:id` | Через `...rest` уходят `verificationCode`, `verificationProofUrl`, `rejectionReason`, `submittedById`. В `members` есть PENDING/DECLINED. Видны DRAFT/REJECTED |
| 4 | `references.ts` GET `/artists` (публичный) | Отдаются полные строки Artist с `verificationCode` и тяжёлым `ymData` |
| 5 | `references.ts` GET `/service-search` | Нет лимитов, видны `pending_review` и исполнители без согласия |
| 6 | `orders.ts` / `vacancies.ts` GET `/:id/matches` | Стоит `optionalAuthenticate`, хотя это функция только для владельца, — утечка списка пользователей |
| 7 | `index.ts` `/api/og/profile/:userId` | Отдаёт ПДн без согласия; в `og:image` двойной `/uploads/` |
| 8 | `posts.ts` GET `/feed` | `limit`/`offset` без ограничений; гость получает комментарии с авторами и `userId` в реакциях |
| 9 | `client/src/lib/api.ts` | 401 → logout и `/login` даже без токена |
| 10 | `client/index.html` | Статичный canonical `/` на всех URL; лишний SearchAction |
| 11 | `middleware/auth.ts` `optionalAuthenticate` | Не проверяет `isBlocked` и `passwordChangedAt` |
| 12 | `releases.ts` / `clips.ts` GET | Не проверяется статус артиста |
| 13 | `OnboardingPrompt.tsx` | Показывается гостю |

## A. Матрица маршрутов
Обозначения: В — видит, У — урезанно, Л — только после входа, Г — только гость.

| Маршрут | Гость | Скрыто / AuthGate | Индекс |
|---|---|---|---|
| `/` | В: LandingPage (вошедший — FeedPage) | CTA «Войти» / «Получить доступ» | index, снимок-хаб |
| `/feed` | У | Видны посты артистов, авторов с согласием, заказы и вакансии; комментарии — только счётчик. Через AuthGate: лайк, реакция, сохранение, репост, голос, комментарий, FAB, «Сохранённые». После offset 200 — стена «войдите» | index, `post` убирается через Clean-param |
| `/flow-settings` | В | — | noindex |
| `/search` | У | «Люди» — только с согласием; «Избранное» скрыто; карточки — `<a href>` | index для `?tab=`, остальное noindex,follow |
| `/artist/:id` | В для VERIFIED/APPROVED; DRAFT/PENDING — с бейджем, noindex; REJECTED → 404 | Состав — ACCEPTED с согласием + «ещё N»; контактные ключи socialLinks скрыты; подписка, вступление, «Написать», жалоба — через AuthGate | index + MusicGroup |
| `/artist/*` (edit/new/…), `/artists/:id/vacancies` | Л | — | Disallow |
| `/releases/:id`, `/clips/:id` | В, если артист не REJECTED | Участники с согласием + «ещё N» | index, MusicAlbum / MusicVideoObject |
| `/profile/:userId` | С согласием — У; без согласия, заблокирован или не существует — заглушка (одинаковый HTTP 404, noindex) | Контакты и личные соцсети спрятаны за «Показать контакты» → AuthGate; ДР, онлайн, время ответа и связи скрыты | index + ProfilePage при пороге качества |
| `/profile/:id/{services,professions,reviews}`, `/professions/:u/:p` | Как профиль, только active | Авторы отзывов без согласия обезличены | noindex,follow |
| `/profile/:id/connections`, `/profile` | Л | — | Disallow |
| `/services/:id` | В, если active и у исполнителя есть согласие, иначе 404 | «Написать», «Сделка» — через AuthGate | index, Service+Offer |
| `/orders/:id` | В для active/done с постом; draft → 404; закрытые — 200 + noindex | Материалы: «N материалов — после входа»; контакты в тексте маскируются | index + Demand |
| `/vacancies/:id` | В для active; archived — 200 + noindex | Материалы скрыты, автором показывается артист | index + JobPosting |
| Приватные: `/messages*`, `/chat`, `/friends*`, `/connection*`, `/deals*`, `/create-post`, `/invite`, `/settings/privacy`, `/pro`, `/admin`, `/onboarding`, `/vk-setup`, формы `/new` и `/edit` | Л | — | Disallow |
| `/login` | Г | — | noindex |
| `/register`, `/forgot-password` | Г | — | Disallow |
| `/privacy`, `/terms` | В | — | index |
| `*` | NotFoundPage (вместо редиректа на `/`) | — | 404 |

Тексты AuthGate зависят от причины: message, contacts, connect, friend, favorite, follow, deal, respondOrder, respondVacancy, join, like, comment, save, repost, vote, create, complaint, feedWall. После входа пользователь возвращается на тот же URL. Само действие повторно не выполняется, вместо этого показывается тост «Теперь можно…». «Поделиться» доступно без входа.

## B. Клиент
- **`components/RouteGuards.tsx`.** `<RequireAuth reason>`: если токена нет, показывает `<LoginRequired>`. `<GuestOnly>`: если токен есть, переводит на `consumeReturnTo() ?? '/'`. `/` = `token ? FeedPage : LandingPage`.
- **Layout и BottomNav для гостя.** Шапка: логотип, «Помощь», «Войти». Нижнее меню: Поток / Каталог / Войти. Колокольчика, бейджей и баннера пушей нет. Внизу плашка «Вы смотрите как гость».
- **AuthGate v2** (расширяет существующий `useAuthGate`): `gate.ensure(reason, ctx, action)`. Если регистрация закрыта, кнопки «Получить доступ» (waitlist в модалке) и «У меня есть приглашение» (`/register?ref=`). Настройки сайта берутся из `useQuery(['site-settings'])`.
- **`lib/authReturn.ts`.** `saveReturnTo` / `consumeReturnTo` через sessionStorage. Разрешены только пути вида `^/(?!/)`, без `/login` и `/register`. Вызываются из LoginPage (email, VK, Telegram), RegisterPage и OnboardingPage.
- **Interceptor.** Редирект на `/login` только если в запросе был `Authorization`.
- **Смена токена** → `queryClient.clear()`. Приватные запросы на публичных страницах получают `enabled: !!me`.
- **Ссылки.** Ключевые `navigate()` на карточках заменить на `<Link>`. Хук `lib/seo.ts` `useSeo` обновляет title, meta и canonical при SPA-навигации.
- **PWA.** SW не кэширует навигации (так и оставить, закрепить тестом). Инлайн-скрипт помечает вошедшего классом `.authed`, и снимок скрывается, чтобы он не мелькал перед загрузкой приложения.
- **Метрика.** Цели `guest_view`, `gate_open`, `gate_login_click`, `gate_access_click`, `waitlist_submit`, `invite_code_submit`, `login_success`, `register_success`; параметр визита `guest:true`.

## C. Сервер
- **`lib/publicData.ts`.**
  - `PUBLIC_PERSON_WHERE` — есть согласие, не заблокирован (с учётом `blockedUntil`).
  - `toPublicPerson` обезличивает людей без согласия.
  - Загрузчики `getPublic{Artist,Release,Clip,Profile,Service,Order,Vacancy,FeedPage,Reviews}` возвращают `{status, data, lastModified}`.
- **`lib/maskContacts.ts`.** Маскирует телефоны, email, t.me, wa.me, @handle и vk.com/id в свободном тексте для гостя.
- **Гостю никогда не отдаются:** email, phone, password, telegram/vk id, birthDate, lastSeenAt, notificationPrefs, isBlocked/blockedUntil, isAdmin, коды, verificationCode/ProofUrl, rejectionReason, submittedById, contactsVisibility, termsAgreedAt, referrer*, avgResponseMinutes, friendship*, responses, reference*, userId в реакциях. Этот же список — запретный в тестах.
- **Эндпоинты:**
  - `users/:id`, `handle`, `:id/services`, `user-service/:id` — гостевые ветки.
  - `users/catalog`: authenticate → optional, `take ≤ 100`, только с согласием.
  - `artists/:id`, `releases`, `clips` — белый список, проверка статуса артиста.
  - `posts/feed`: `limit ≤ 20`, `offset ≤ 200`, без комментариев, реакции агрегатами. `posts/:id` → optional.
  - `orders/:id`, `vacancies/:id` — без материалов. `*/matches` → только владелец.
  - `reviews/user/:id` — обезличивание.
  - `references/artists` и `service-search` — белые списки и лимиты.
  - `og/profile/:id` → 301 на `/profile/:id`.
  - Новое: `DELETE /users/me/public-consent`. Опционально (Ф2b) — публичные списки заказов и вакансий.
- **Нагрузка.**
  - `guestReadLimiter` — 300 запросов за 5 минут с IP, `seoLimiter` — 120 в минуту.
  - Гостевой JSON: `no-cache` + ETag (без `public, max-age` — иначе после входа отдастся гостевая версия).
  - Микрокэш гостевой ленты — 60 секунд.

## D. SEO-снимки
- **`client/nginx.conf`.** `resolver 127.0.0.11`, upstream задаётся через переменную. Публичные пути идут на `api/seo/render$request_uri`. `X-Forwarded-For` пробрасывается как есть. `Authorization` и `Cookie` вырезаются. Таймауты 1/4 с; на 5xx отдаётся `index.html` со статусом 503. `/sitemap*.xml` идёт на api. Для приватных префиксов `X-Robots-Tag` через `map`. `/groups/:id` → 301. Отдельный `/healthz` для healthcheck web.
- **Express.** `app.use('/seo', seoRouter)` подключается **до helmet**, CSP с HTML снимается. Файлы в `server/src/seo/`:
  - `template.ts` — условный GET `http://web:3000/index.html`;
  - `routes.ts` — зеркало маршрутов App.tsx;
  - `render/*`;
  - `jsonld.ts`, `html.ts`, `cache.ts`, `sitemap.ts`.
- **`client/index.html`.** Маркеры `<!--seo:head-->…<!--/seo:head-->` и `<div id="root"><!--seo:body--></div>`. Статичный canonical и SearchAction убрать. В Dockerfile проверка, что маркеры есть.
- **Тело снимка.** `<div data-ssr>` внутри `#root`: хлебные крошки, `h1`, факты, описание, ссылки. Стили инлайн `.ssr-*`. `createRoot` заменяет этот блок при первом рендере. Боты и люди получают одно и то же, поэтому это не клоакинг.
- **JSON-LD:**
  - MusicGroup — артист;
  - MusicAlbum — релиз (тип выпуска, треки с ISO-длительностью);
  - MusicVideoObject — клип;
  - ProfilePage + Person — профиль;
  - Service + Offer/PriceSpecification — услуга;
  - JobPosting — вакансия;
  - Demand — заказ;
  - CollectionPage + ItemList — лента;
  - BreadcrumbList — все страницы.
- **Статусы.** Скрытое или несуществующее → 404 + noindex (для профилей тело одинаковое во всех случаях). Закрытые сущности → 200 + noindex. Хвостовой слэш и `/groups` → 301. `Last-Modified` + ETag.
- **Кэш.** LRU на 500 записей; TTL 10 минут для сущностей, 2 минуты для ленты и каталога, 30 минут для sitemap. Инвалидация через `prisma.$use`. Обновления, меняющие только `lastSeenAt`, игнорируются: они идут каждые 30 секунд.
- **OG-картинки.** `absUrl()` поддерживает и `/uploads/…`, и абсолютные URL VK. Для ЯМ берётся `1000x1000`. Дефолтная картинка — `og-default.png` 1200×630.
- **Яндекс.** Подтвердить права в Вебмастере, отправить sitemap, «Обход по счётчикам». 301 www→apex. Проверить `mooza.ru`. Директиву `Host` убрать. IndexNow — в Ф6.

## E. Sitemap и robots
- **Индекс `/sitemap.xml`** и дочерние sitemap по типам. Отбор:
  - artists — VERIFIED/APPROVED с контентом;
  - releases, clips;
  - profiles — согласие + порог качества: аватар и (bio ≥ 80 символов, или услуга, или участие в артисте); без lastmod;
  - services — active;
  - vacancies, orders — active с постом.
- **Нарезка.** Не больше 45 тыс. URL в файле. Статический `client/public/sitemap.xml` удалить.
- **robots.txt.** Закрыть всё приватное (полный список в отчёте агента — перенести при реализации). `Clean-param` для utm, ref, yclid, `post`, фильтров поиска. `/api/` не закрывать, вместо этого ставить `X-Robots-Tag: noindex` на ответы API и на `/uploads`, кроме аватаров и обложек.
- **DEV.** sitemap отдаёт 404, на всех ответах `noindex,nofollow` (env `SEO_INDEXABLE=false`). Конфиг DEV host-nginx перенести в `deploy/infra/`.

## F. Правовое и приватность
- **Текущее согласие.** Текст `legal/consent-pd-public.html` (редакция 31.05.2026) уже покрывает доступ незарегистрированных и индексацию. Полученные согласия действительны.
- **Схема.** `User.publicConsentRevokedAt`, `User.searchIndexingOptOut`, модель `ConsentEvent` (тип, действие, версия, источник, IP, UA, дата). Миграции создаются через `--create-only`.
- **Отзыв согласия.**
  - `publicConsentAt = null`, `ConsentEvent`;
  - `contactsVisibility` ALL → REGISTERED;
  - сброс снимков и sitemap, мгновенный 404 для гостя;
  - переименование файлов аватара и баннера;
  - инструкция поддержке по удалению страниц в Вебмастере.
- **Как набрать согласия.**
  - карточка в профиле «Сделайте профиль публичным» с превью гостевого вида;
  - разовая модалка для тех, у кого есть услуги, артисты или титры (не чаще раза в 30 дней, не больше 3 раз, чекбокс не отмечен по умолчанию);
  - мотивация через титры;
  - необязательный шаг онбординга;
  - уведомление уже согласившимся и 14 дней до попадания в sitemap.
- **Обновить документы (решать с юристом):**
  - гости как субъекты ПДн (IP, логи, cookies, Метрика);
  - цели «публичная витрина» и «индексация»;
  - что распространяется публично, а что нет;
  - обезличивание;
  - отзыв согласия и внешние кэши;
  - запрет индексации;
  - публичность пользовательского контента;
  - Метрика грузится до согласия на cookies;
  - обязательное рекламное согласие в waitlist (ст. 18 ФЗ «О рекламе»);
  - пользовательское соглашение;
  - уведомление в РКН (цель «распространение»).

## G. Фазы
| Фаза | Содержание | Дни | Критерий готовности |
|---|---|---|---|
| Ф0 | Блокеры 0.1 (часть закрывается текущими фиксами аудита) | 1–1,5 | Deep-key тест всех GET без токена зелёный |
| Ф1 | `publicData`, `maskContacts`, гостевые ветки, лимиты, отзыв согласия, `ConsentEvent` | 3 | Белые списки; 404 для людей без согласия и черновиков; у авторизованных нет регрессий |
| Ф2 | Одно дерево роутов, guards, Layout, AuthGate v2 + возврат + waitlist, гостевые состояния, `<Link>`, `useSeo`, Метрика, флаг (Ф2b: публичные заказы и вакансии, +1–1,5) | 4–5 | `guest.spec.ts` проходит на 3 устройствах; гость не ходит в socket.io и уведомления; возврат после входа работает |
| Ф3 | UI согласия и отзыва, баннер, модалка, онбординг | 1,5–2 | После отзыва — сразу 404, из sitemap пропадает ≤ 1 мин |
| Ф4 | Снимки, маркеры, nginx.conf, sitemap, robots, кэш, 301 og/profile, healthcheck | 4–5 | curl с UA ботов и человека даёт одинаковое тело; валидаторы чистые; без api — 503 + SPA; p95 < 20 мс из кэша и < 150 мс без кэша |
| Ф5 | Запуск: robots/sitemap на PROD, 301 www, Вебмастер и GSC, воронка | 1 + 2–4 недели | Sitemap принят, приватных URL в индексе нет |
| Ф6 (опц.) | Слаги, посадочные страницы категорий, OG-генератор, IndexNow, `/posts/:id`, гидрация из снимка | 8–10 | — |

Итого по основным фазам: **около 15–18 рабочих дней**.

Включение на PROD: деплой с выключенными флагами → DEV → `guestBrowsingEnabled` на PROD → неделя наблюдения → `SEO_SNAPSHOTS` → открытие robots/sitemap.

**Риски:**
- дубли контента — решаются 301, canonical, Clean-param;
- утечка полей — белые списки и deep-key тесты;
- нагрузка от краулеров — LRU, лимиты;
- регрессии входа и PWA;
- падение web-nginx без api — resolver;
- неверный `req.ip` — XFF как есть;
- CSP на HTML — роутер до helmet;
- «малоценные страницы» — пороги качества;
- юридические риски.

**Тестирование:**
- jest + supertest: deep-key запрет на всех GET без токена, 404 для людей без согласия, экранирование, JSON-LD;
- Playwright `guest.spec.ts` на 3 устройствах;
- curl с UA YandexBot/Googlebot;
- валидаторы schema.org, Rich Results, Вебмастер, проверка OG в VK и Telegram.
