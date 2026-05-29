# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notifications_nav.spec.ts >> Info modal >> clicking info button opens modal with О Moooza
- Location: tests\playwright\notifications_nav.spec.ts:472:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=О Moooza')
Expected: visible
Error: strict mode violation: locator('text=О Moooza') resolved to 2 elements:
    1) <p class="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">👋 Привет! Это Moooza — соцсеть для музыкальной ин…</p> aka getByText('👋 Привет! Это Moooza')
    2) <h2 class="text-base font-bold text-white">О Moooza</h2> aka getByRole('heading', { name: 'О Moooza' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=О Moooza')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e5]:
      - link "Moooza" [ref=e6]:
        - /url: /
        - img "Moooza" [ref=e7]
      - generic [ref=e8]:
        - button [ref=e9] [cursor=pointer]:
          - img [ref=e10]
        - button "Информация" [ref=e13] [cursor=pointer]:
          - img [ref=e14]
        - button "Реферальная программа" [ref=e16] [cursor=pointer]:
          - img [ref=e17]
    - main [ref=e21]:
      - generic [ref=e24]:
        - generic [ref=e25]:
          - generic [ref=e26]:
            - generic [ref=e27]:
              - img [ref=e28]
              - heading "Поток" [level=2] [ref=e30]
            - button "Настроить" [ref=e31] [cursor=pointer]:
              - img [ref=e32]
              - generic [ref=e33]: Настроить
          - generic [ref=e34]:
            - button "По новизне" [ref=e35] [cursor=pointer]
            - button "Популярное" [ref=e36] [cursor=pointer]
            - button "Сохранённые" [ref=e37] [cursor=pointer]:
              - img [ref=e38]
              - text: Сохранённые
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e44]:
              - link "КM" [ref=e45]:
                - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                - generic [ref=e47]: КM
              - generic [ref=e48]:
                - generic [ref=e49]:
                  - link "Команда Moooza" [ref=e50]:
                    - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                  - generic "Верифицирован" [ref=e51]:
                    - img [ref=e52]
                - paragraph [ref=e55]: 17 ч.
            - paragraph [ref=e58]: 👋 Привет! Это Moooza — соцсеть для музыкальной индустрии. Здесь профессионалы находят заказы, заказчики — исполнителей, а музыканты — друг друга. Заполни профиль, добавь свои услуги и начни строить связи!
            - generic [ref=e59]:
              - button "0" [ref=e60] [cursor=pointer]:
                - img [ref=e61]
                - generic [ref=e63]: "0"
              - button "0" [ref=e64] [cursor=pointer]:
                - img [ref=e65]
                - generic [ref=e67]: "0"
              - button "Поделиться" [ref=e68] [cursor=pointer]:
                - img [ref=e69]
              - button "Сохранить" [ref=e75] [cursor=pointer]:
                - img [ref=e76]
          - generic [ref=e78]:
            - generic [ref=e80]:
              - link "КM" [ref=e81]:
                - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                - generic [ref=e83]: КM
              - generic [ref=e84]:
                - generic [ref=e85]:
                  - link "Команда Moooza" [ref=e86]:
                    - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                  - generic "Верифицирован" [ref=e87]:
                    - img [ref=e88]
                - paragraph [ref=e91]: 17 ч.
            - paragraph [ref=e94]: 🎯 Что есть в Moooza? • Каталог из 126 музыкальных профессий • Услуги с прайс-листами и сроками • Сделки с безопасной оплатой (скоро) • 10-балльные отзывы и репутация • Связи между профессионалами • Деловые и личные чаты • Артисты с релизами и клипами
            - generic [ref=e95]:
              - button "0" [ref=e96] [cursor=pointer]:
                - img [ref=e97]
                - generic [ref=e99]: "0"
              - button "0" [ref=e100] [cursor=pointer]:
                - img [ref=e101]
                - generic [ref=e103]: "0"
              - button "Поделиться" [ref=e104] [cursor=pointer]:
                - img [ref=e105]
              - button "Сохранить" [ref=e111] [cursor=pointer]:
                - img [ref=e112]
          - generic [ref=e114]:
            - generic [ref=e116]:
              - link "КM" [ref=e117]:
                - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                - generic [ref=e119]: КM
              - generic [ref=e120]:
                - generic [ref=e121]:
                  - link "Команда Moooza" [ref=e122]:
                    - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                  - generic "Верифицирован" [ref=e123]:
                    - img [ref=e124]
                - paragraph [ref=e127]: 17 ч.
            - paragraph [ref=e130]: "💼 Как получить первый заказ: 1. Заполни профиль на 100% 2. Добавь 1-2 услуги в каталог 3. Загрузи портфолио (аудио/изображения) 4. Размести \"Апдейт занятости\" в Потоке — расскажи, что свободен 5. Установи связи с коллегами Чем активнее ты в Потоке — тем выше шанс на заказ."
            - generic [ref=e131]:
              - button "0" [ref=e132] [cursor=pointer]:
                - img [ref=e133]
                - generic [ref=e135]: "0"
              - button "0" [ref=e136] [cursor=pointer]:
                - img [ref=e137]
                - generic [ref=e139]: "0"
              - button "Поделиться" [ref=e140] [cursor=pointer]:
                - img [ref=e141]
              - button "Сохранить" [ref=e147] [cursor=pointer]:
                - img [ref=e148]
          - generic [ref=e150]:
            - generic [ref=e152]:
              - link "КM" [ref=e153]:
                - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                - generic [ref=e155]: КM
              - generic [ref=e156]:
                - generic [ref=e157]:
                  - link "Команда Moooza" [ref=e158]:
                    - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                  - generic "Верифицирован" [ref=e159]:
                    - img [ref=e160]
                - paragraph [ref=e163]: 17 ч.
            - paragraph [ref=e166]: 🤝 Что такое "Связи" в Moooza? Это профессиональная сеть. С каждым, с кем поработал — устанавливается связь. У связи есть роли (исполнитель/заказчик/коллега) и предмет (услуга, по которой работали). Чем больше связей — тем сильнее твоя репутация.
            - generic [ref=e167]:
              - button "0" [ref=e168] [cursor=pointer]:
                - img [ref=e169]
                - generic [ref=e171]: "0"
              - button "0" [ref=e172] [cursor=pointer]:
                - img [ref=e173]
                - generic [ref=e175]: "0"
              - button "Поделиться" [ref=e176] [cursor=pointer]:
                - img [ref=e177]
              - button "Сохранить" [ref=e183] [cursor=pointer]:
                - img [ref=e184]
          - generic [ref=e186]:
            - generic [ref=e188]:
              - link "КM" [ref=e189]:
                - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                - generic [ref=e191]: КM
              - generic [ref=e192]:
                - generic [ref=e193]:
                  - link "Команда Moooza" [ref=e194]:
                    - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                  - generic "Верифицирован" [ref=e195]:
                    - img [ref=e196]
                - paragraph [ref=e199]: 17 ч.
            - paragraph [ref=e202]: "📣 Как работает Поток? Это общая лента всех публикаций платформы. Доступны типы: Блог, Вопрос, Опрос, Апдейт услуги, Апдейт занятости. Лайки, комментарии, реакции, сохранение в избранное (звёздочка) — всё знакомо."
            - generic [ref=e203]:
              - button "0" [ref=e204] [cursor=pointer]:
                - img [ref=e205]
                - generic [ref=e207]: "0"
              - button "0" [ref=e208] [cursor=pointer]:
                - img [ref=e209]
                - generic [ref=e211]: "0"
              - button "Поделиться" [ref=e212] [cursor=pointer]:
                - img [ref=e213]
              - button "Сохранить" [ref=e219] [cursor=pointer]:
                - img [ref=e220]
          - generic [ref=e222]:
            - generic [ref=e224]:
              - link "КM" [ref=e225]:
                - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                - generic [ref=e227]: КM
              - generic [ref=e228]:
                - generic [ref=e229]:
                  - link "Команда Moooza" [ref=e230]:
                    - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                  - generic "Верифицирован" [ref=e231]:
                    - img [ref=e232]
                - paragraph [ref=e235]: 17 ч.
            - paragraph [ref=e238]: 🎸 Артисты на Moooza Если ты в группе, дуэте или соло-проекте — создай профиль артиста. После верификации (нужно разместить код в описании ВК/Instagram артиста) он появится в каталоге. Добавляй релизы, клипы, участников — это твоё лицо в индустрии.
            - generic [ref=e239]:
              - button "0" [ref=e240] [cursor=pointer]:
                - img [ref=e241]
                - generic [ref=e243]: "0"
              - button "0" [ref=e244] [cursor=pointer]:
                - img [ref=e245]
                - generic [ref=e247]: "0"
              - button "Поделиться" [ref=e248] [cursor=pointer]:
                - img [ref=e249]
              - button "Сохранить" [ref=e255] [cursor=pointer]:
                - img [ref=e256]
          - generic [ref=e258]:
            - generic [ref=e260]:
              - link "КM" [ref=e261]:
                - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                - generic [ref=e263]: КM
              - generic [ref=e264]:
                - generic [ref=e265]:
                  - link "Команда Moooza" [ref=e266]:
                    - /url: /profile/5afa562f-16c3-450e-ba95-1b21ed26b585
                  - generic "Верифицирован" [ref=e267]:
                    - img [ref=e268]
                - paragraph [ref=e271]: 17 ч.
            - paragraph [ref=e274]: 🚀 Удачи в Moooza! Если есть вопросы — пиши в Telegram-поддержку через кнопку "Информация" в шапке. Развиваем платформу вместе с тобой — обратная связь очень ценна.
            - generic [ref=e275]:
              - button "0" [ref=e276] [cursor=pointer]:
                - img [ref=e277]
                - generic [ref=e279]: "0"
              - button "0" [ref=e280] [cursor=pointer]:
                - img [ref=e281]
                - generic [ref=e283]: "0"
              - button "Поделиться" [ref=e284] [cursor=pointer]:
                - img [ref=e285]
              - button "Сохранить" [ref=e291] [cursor=pointer]:
                - img [ref=e292]
          - generic [ref=e294]:
            - generic [ref=e296]:
              - link "PM" [ref=e297]:
                - /url: /profile/419eb584-ebfe-493f-b394-bcd98ddc700a
                - generic [ref=e299]: PM
              - generic [ref=e300]:
                - link "PWFP mpr1c18rpenm" [ref=e302]:
                  - /url: /profile/419eb584-ebfe-493f-b394-bcd98ddc700a
                - paragraph [ref=e303]: 12 мин.
            - paragraph [ref=e306]: PW test post — feed_posts_spec
            - generic [ref=e307]:
              - button "0" [ref=e308] [cursor=pointer]:
                - img [ref=e309]
                - generic [ref=e311]: "0"
              - button "0" [ref=e312] [cursor=pointer]:
                - img [ref=e313]
                - generic [ref=e315]: "0"
              - button "Поделиться" [ref=e316] [cursor=pointer]:
                - img [ref=e317]
              - button "Сохранить" [ref=e323] [cursor=pointer]:
                - img [ref=e324]
          - generic [ref=e326]:
            - generic [ref=e328]:
              - link "PM" [ref=e329]:
                - /url: /profile/c0fb8a81-e247-4fee-80ee-1aca0cfb30d0
                - generic [ref=e331]: PM
              - generic [ref=e332]:
                - generic [ref=e333]:
                  - link "PWFP mpr19fmptg3d" [ref=e334]:
                    - /url: /profile/c0fb8a81-e247-4fee-80ee-1aca0cfb30d0
                  - generic [ref=e335]:
                    - img [ref=e336]
                    - text: Опрос
                - paragraph [ref=e338]:
                  - text: 13 мин.
                  - generic [ref=e339]: · изменён 13 мин.
            - generic [ref=e341]:
              - generic [ref=e342]:
                - button "Option A 100% · 1" [ref=e343] [cursor=pointer]:
                  - generic [ref=e345]:
                    - generic [ref=e346]: Option A
                    - generic [ref=e347]: 100% · 1
                - button "Option B 0% · 0" [ref=e348] [cursor=pointer]:
                  - generic [ref=e349]:
                    - generic [ref=e350]: Option B
                    - generic [ref=e351]: 0% · 0
                - button "Option C 0% · 0" [ref=e352] [cursor=pointer]:
                  - generic [ref=e353]:
                    - generic [ref=e354]: Option C
                    - generic [ref=e355]: 0% · 0
                - paragraph [ref=e356]: 1 голос · до 05.06.2026
              - paragraph [ref=e357]: PW poll test
            - generic [ref=e358]:
              - button "0" [ref=e359] [cursor=pointer]:
                - img [ref=e360]
                - generic [ref=e362]: "0"
              - button "0" [ref=e363] [cursor=pointer]:
                - img [ref=e364]
                - generic [ref=e366]: "0"
              - button "Поделиться" [ref=e367] [cursor=pointer]:
                - img [ref=e368]
              - button "Сохранить" [ref=e374] [cursor=pointer]:
                - img [ref=e375]
          - generic [ref=e377]:
            - generic [ref=e379]:
              - link "PM" [ref=e380]:
                - /url: /profile/c0fb8a81-e247-4fee-80ee-1aca0cfb30d0
                - generic [ref=e382]: PM
              - generic [ref=e383]:
                - link "PWFP mpr19fmptg3d" [ref=e385]:
                  - /url: /profile/c0fb8a81-e247-4fee-80ee-1aca0cfb30d0
                - paragraph [ref=e386]: 13 мин.
            - paragraph [ref=e389]: Playwright auto-published post 1780065908499
            - generic [ref=e390]:
              - button "0" [ref=e391] [cursor=pointer]:
                - img [ref=e392]
                - generic [ref=e394]: "0"
              - button "0" [ref=e395] [cursor=pointer]:
                - img [ref=e396]
                - generic [ref=e398]: "0"
              - button "Поделиться" [ref=e399] [cursor=pointer]:
                - img [ref=e400]
              - button "Сохранить" [ref=e406] [cursor=pointer]:
                - img [ref=e407]
          - generic [ref=e409]:
            - generic [ref=e411]:
              - link "PM" [ref=e412]:
                - /url: /profile/c0fb8a81-e247-4fee-80ee-1aca0cfb30d0
                - generic [ref=e414]: PM
              - generic [ref=e415]:
                - link "PWFP mpr19fmptg3d" [ref=e417]:
                  - /url: /profile/c0fb8a81-e247-4fee-80ee-1aca0cfb30d0
                - paragraph [ref=e418]: 14 мин.
            - paragraph [ref=e421]: PW test post — feed_posts_spec
            - generic [ref=e422]:
              - button "0" [ref=e423] [cursor=pointer]:
                - img [ref=e424]
                - generic [ref=e426]: "0"
              - button "1" [ref=e427] [cursor=pointer]:
                - img [ref=e428]
                - generic [ref=e430]: "1"
              - button "Поделиться" [ref=e431] [cursor=pointer]:
                - img [ref=e432]
              - button "Сохранить" [ref=e438] [cursor=pointer]:
                - img [ref=e439]
          - generic [ref=e441]:
            - generic [ref=e443]:
              - link "PM" [ref=e444]:
                - /url: /profile/a7bb04d5-c324-46ed-9393-bafee8e00d11
                - generic [ref=e446]: PM
              - generic [ref=e447]:
                - link "PWPWA mpr1659p8hnx" [ref=e449]:
                  - /url: /profile/a7bb04d5-c324-46ed-9393-bafee8e00d11
                - paragraph [ref=e450]: 16 мин.
            - paragraph [ref=e453]: PWA platform test
            - generic [ref=e454]:
              - button "0" [ref=e455] [cursor=pointer]:
                - img [ref=e456]
                - generic [ref=e458]: "0"
              - button "0" [ref=e459] [cursor=pointer]:
                - img [ref=e460]
                - generic [ref=e462]: "0"
              - button "Поделиться" [ref=e463] [cursor=pointer]:
                - img [ref=e464]
              - button "Сохранить" [ref=e470] [cursor=pointer]:
                - img [ref=e471]
          - generic [ref=e473]:
            - generic [ref=e475]:
              - link "PM" [ref=e476]:
                - /url: /profile/7a906447-d751-4668-9596-dd24aa27e8ec
                - generic [ref=e478]: PM
              - generic [ref=e479]:
                - link "PWPWA mpr158nx7d5y" [ref=e481]:
                  - /url: /profile/7a906447-d751-4668-9596-dd24aa27e8ec
                - paragraph [ref=e482]: 17 мин.
            - paragraph [ref=e485]: PWA platform test
            - generic [ref=e486]:
              - button "0" [ref=e487] [cursor=pointer]:
                - img [ref=e488]
                - generic [ref=e490]: "0"
              - button "0" [ref=e491] [cursor=pointer]:
                - img [ref=e492]
                - generic [ref=e494]: "0"
              - button "Поделиться" [ref=e495] [cursor=pointer]:
                - img [ref=e496]
              - button "Сохранить" [ref=e502] [cursor=pointer]:
                - img [ref=e503]
          - generic [ref=e505]:
            - generic [ref=e507]:
              - link "PM" [ref=e508]:
                - /url: /profile/de656f07-fb90-43c5-b101-eff6fa83502e
                - generic [ref=e510]: PM
              - generic [ref=e511]:
                - generic [ref=e512]:
                  - link "PWFP mpr0p03kiypy" [ref=e513]:
                    - /url: /profile/de656f07-fb90-43c5-b101-eff6fa83502e
                  - generic [ref=e514]:
                    - img [ref=e515]
                    - text: Опрос
                - paragraph [ref=e517]: 29 мин.
            - generic [ref=e519]:
              - generic [ref=e520]:
                - button "Option A 100% · 1" [ref=e521] [cursor=pointer]:
                  - generic [ref=e523]:
                    - generic [ref=e524]: Option A
                    - generic [ref=e525]: 100% · 1
                - button "Option B 0% · 0" [ref=e526] [cursor=pointer]:
                  - generic [ref=e527]:
                    - generic [ref=e528]: Option B
                    - generic [ref=e529]: 0% · 0
                - button "Option C 0% · 0" [ref=e530] [cursor=pointer]:
                  - generic [ref=e531]:
                    - generic [ref=e532]: Option C
                    - generic [ref=e533]: 0% · 0
                - paragraph [ref=e534]: 1 голос · до 05.06.2026
              - paragraph [ref=e535]: PW poll test
            - generic [ref=e536]:
              - button "0" [ref=e537] [cursor=pointer]:
                - img [ref=e538]
                - generic [ref=e540]: "0"
              - button "0" [ref=e541] [cursor=pointer]:
                - img [ref=e542]
                - generic [ref=e544]: "0"
              - button "Поделиться" [ref=e545] [cursor=pointer]:
                - img [ref=e546]
              - button "Сохранить" [ref=e552] [cursor=pointer]:
                - img [ref=e553]
          - generic [ref=e555]:
            - generic [ref=e557]:
              - link "PM" [ref=e558]:
                - /url: /profile/de656f07-fb90-43c5-b101-eff6fa83502e
                - generic [ref=e560]: PM
              - generic [ref=e561]:
                - link "PWFP mpr0p03kiypy" [ref=e563]:
                  - /url: /profile/de656f07-fb90-43c5-b101-eff6fa83502e
                - paragraph [ref=e564]: 29 мин.
            - paragraph [ref=e567]: Playwright auto-published post 1780064957456
            - generic [ref=e568]:
              - button "0" [ref=e569] [cursor=pointer]:
                - img [ref=e570]
                - generic [ref=e572]: "0"
              - button "0" [ref=e573] [cursor=pointer]:
                - img [ref=e574]
                - generic [ref=e576]: "0"
              - button "Поделиться" [ref=e577] [cursor=pointer]:
                - img [ref=e578]
              - button "Сохранить" [ref=e584] [cursor=pointer]:
                - img [ref=e585]
          - generic [ref=e587]:
            - generic [ref=e589]:
              - link "PM" [ref=e590]:
                - /url: /profile/de656f07-fb90-43c5-b101-eff6fa83502e
                - generic [ref=e592]: PM
              - generic [ref=e593]:
                - link "PWFP mpr0p03kiypy" [ref=e595]:
                  - /url: /profile/de656f07-fb90-43c5-b101-eff6fa83502e
                - paragraph [ref=e596]: 30 мин.
            - paragraph [ref=e599]: PW test post — feed_posts_spec
            - generic [ref=e600]:
              - button "0" [ref=e601] [cursor=pointer]:
                - img [ref=e602]
                - generic [ref=e604]: "0"
              - button "1" [ref=e605] [cursor=pointer]:
                - img [ref=e606]
                - generic [ref=e608]: "1"
              - button "Поделиться" [ref=e609] [cursor=pointer]:
                - img [ref=e610]
              - button "Сохранить" [ref=e616] [cursor=pointer]:
                - img [ref=e617]
          - generic [ref=e619]:
            - generic [ref=e621]:
              - link "PM" [ref=e622]:
                - /url: /profile/413c14dc-6fe0-4eb7-867f-00c6d917fb33
                - generic [ref=e624]: PM
              - generic [ref=e625]:
                - generic [ref=e626]:
                  - link "PWFP mpqz8abrmm3d" [ref=e627]:
                    - /url: /profile/413c14dc-6fe0-4eb7-867f-00c6d917fb33
                  - generic [ref=e628]:
                    - img [ref=e629]
                    - text: Опрос
                - paragraph [ref=e631]:
                  - text: 1 ч.
                  - generic [ref=e632]: · изменён 1 ч.
            - generic [ref=e634]:
              - generic [ref=e635]:
                - button "Option A 100% · 1" [ref=e636] [cursor=pointer]:
                  - generic [ref=e638]:
                    - generic [ref=e639]: Option A
                    - generic [ref=e640]: 100% · 1
                - button "Option B 0% · 0" [ref=e641] [cursor=pointer]:
                  - generic [ref=e642]:
                    - generic [ref=e643]: Option B
                    - generic [ref=e644]: 0% · 0
                - button "Option C 0% · 0" [ref=e645] [cursor=pointer]:
                  - generic [ref=e646]:
                    - generic [ref=e647]: Option C
                    - generic [ref=e648]: 0% · 0
                - paragraph [ref=e649]: 1 голос · до 05.06.2026
              - paragraph [ref=e650]: PW poll test
            - generic [ref=e651]:
              - button "0" [ref=e652] [cursor=pointer]:
                - img [ref=e653]
                - generic [ref=e655]: "0"
              - button "0" [ref=e656] [cursor=pointer]:
                - img [ref=e657]
                - generic [ref=e659]: "0"
              - button "Поделиться" [ref=e660] [cursor=pointer]:
                - img [ref=e661]
              - button "Сохранить" [ref=e667] [cursor=pointer]:
                - img [ref=e668]
          - generic [ref=e670]:
            - generic [ref=e672]:
              - link "PM" [ref=e673]:
                - /url: /profile/413c14dc-6fe0-4eb7-867f-00c6d917fb33
                - generic [ref=e675]: PM
              - generic [ref=e676]:
                - link "PWFP mpqz8abrmm3d" [ref=e678]:
                  - /url: /profile/413c14dc-6fe0-4eb7-867f-00c6d917fb33
                - paragraph [ref=e679]: 1 ч.
            - paragraph [ref=e682]: Playwright auto-published post 1780062496644
            - generic [ref=e683]:
              - button "0" [ref=e684] [cursor=pointer]:
                - img [ref=e685]
                - generic [ref=e687]: "0"
              - button "0" [ref=e688] [cursor=pointer]:
                - img [ref=e689]
                - generic [ref=e691]: "0"
              - button "Поделиться" [ref=e692] [cursor=pointer]:
                - img [ref=e693]
              - button "Сохранить" [ref=e699] [cursor=pointer]:
                - img [ref=e700]
          - generic [ref=e702]:
            - generic [ref=e704]:
              - link "PM" [ref=e705]:
                - /url: /profile/413c14dc-6fe0-4eb7-867f-00c6d917fb33
                - generic [ref=e707]: PM
              - generic [ref=e708]:
                - link "PWFP mpqz8abrmm3d" [ref=e710]:
                  - /url: /profile/413c14dc-6fe0-4eb7-867f-00c6d917fb33
                - paragraph [ref=e711]: 1 ч.
            - paragraph [ref=e714]: PW test post — feed_posts_spec
            - generic [ref=e715]:
              - button "0" [ref=e716] [cursor=pointer]:
                - img [ref=e717]
                - generic [ref=e719]: "0"
              - button "1" [ref=e720] [cursor=pointer]:
                - img [ref=e721]
                - generic [ref=e723]: "1"
              - button "Поделиться" [ref=e724] [cursor=pointer]:
                - img [ref=e725]
              - button "Сохранить" [ref=e731] [cursor=pointer]:
                - img [ref=e732]
          - generic [ref=e734]:
            - generic [ref=e736]:
              - link "PM" [ref=e737]:
                - /url: /profile/2c1e73d6-d8c4-4d41-bcef-48473b48ee83
                - generic [ref=e739]: PM
              - generic [ref=e740]:
                - generic [ref=e741]:
                  - link "PWFP mpqyxi4tmlbz" [ref=e742]:
                    - /url: /profile/2c1e73d6-d8c4-4d41-bcef-48473b48ee83
                  - generic [ref=e743]:
                    - img [ref=e744]
                    - text: Опрос
                - paragraph [ref=e746]:
                  - text: 1 ч.
                  - generic [ref=e747]: · изменён 1 ч.
            - generic [ref=e749]:
              - generic [ref=e750]:
                - button "Option A 100% · 1" [ref=e751] [cursor=pointer]:
                  - generic [ref=e753]:
                    - generic [ref=e754]: Option A
                    - generic [ref=e755]: 100% · 1
                - button "Option B 0% · 0" [ref=e756] [cursor=pointer]:
                  - generic [ref=e757]:
                    - generic [ref=e758]: Option B
                    - generic [ref=e759]: 0% · 0
                - button "Option C 0% · 0" [ref=e760] [cursor=pointer]:
                  - generic [ref=e761]:
                    - generic [ref=e762]: Option C
                    - generic [ref=e763]: 0% · 0
                - paragraph [ref=e764]: 1 голос · до 05.06.2026
              - paragraph [ref=e765]: PW poll test
            - generic [ref=e766]:
              - button "0" [ref=e767] [cursor=pointer]:
                - img [ref=e768]
                - generic [ref=e770]: "0"
              - button "0" [ref=e771] [cursor=pointer]:
                - img [ref=e772]
                - generic [ref=e774]: "0"
              - button "Поделиться" [ref=e775] [cursor=pointer]:
                - img [ref=e776]
              - button "Сохранить" [ref=e782] [cursor=pointer]:
                - img [ref=e783]
          - generic [ref=e785]:
            - generic [ref=e787]:
              - link "PM" [ref=e788]:
                - /url: /profile/2c1e73d6-d8c4-4d41-bcef-48473b48ee83
                - generic [ref=e790]: PM
              - generic [ref=e791]:
                - link "PWFP mpqyxi4tmlbz" [ref=e793]:
                  - /url: /profile/2c1e73d6-d8c4-4d41-bcef-48473b48ee83
                - paragraph [ref=e794]: 1 ч.
            - paragraph [ref=e797]: Playwright auto-published post 1780061990204
            - generic [ref=e798]:
              - button "0" [ref=e799] [cursor=pointer]:
                - img [ref=e800]
                - generic [ref=e802]: "0"
              - button "0" [ref=e803] [cursor=pointer]:
                - img [ref=e804]
                - generic [ref=e806]: "0"
              - button "Поделиться" [ref=e807] [cursor=pointer]:
                - img [ref=e808]
              - button "Сохранить" [ref=e814] [cursor=pointer]:
                - img [ref=e815]
          - generic [ref=e817]:
            - generic [ref=e819]:
              - link "PM" [ref=e820]:
                - /url: /profile/2c1e73d6-d8c4-4d41-bcef-48473b48ee83
                - generic [ref=e822]: PM
              - generic [ref=e823]:
                - link "PWFP mpqyxi4tmlbz" [ref=e825]:
                  - /url: /profile/2c1e73d6-d8c4-4d41-bcef-48473b48ee83
                - paragraph [ref=e826]: 1 ч.
            - paragraph [ref=e829]: PW test post — feed_posts_spec
            - generic [ref=e830]:
              - button "0" [ref=e831] [cursor=pointer]:
                - img [ref=e832]
                - generic [ref=e834]: "0"
              - button "1" [ref=e835] [cursor=pointer]:
                - img [ref=e836]
                - generic [ref=e838]: "1"
              - button "Поделиться" [ref=e839] [cursor=pointer]:
                - img [ref=e840]
              - button "Сохранить" [ref=e846] [cursor=pointer]:
                - img [ref=e847]
          - generic [ref=e849]:
            - generic [ref=e851]:
              - link "PM" [ref=e852]:
                - /url: /profile/d36a73f3-5d7d-4ca1-b9ce-2da7abd6bcea
                - generic [ref=e854]: PM
              - generic [ref=e855]:
                - link "PWFP mpqyx4et1ncf" [ref=e857]:
                  - /url: /profile/d36a73f3-5d7d-4ca1-b9ce-2da7abd6bcea
                - paragraph [ref=e858]: 1 ч.
            - paragraph [ref=e861]: Playwright auto-published post 1780061946429
            - generic [ref=e862]:
              - button "0" [ref=e863] [cursor=pointer]:
                - img [ref=e864]
                - generic [ref=e866]: "0"
              - button "0" [ref=e867] [cursor=pointer]:
                - img [ref=e868]
                - generic [ref=e870]: "0"
              - button "Поделиться" [ref=e871] [cursor=pointer]:
                - img [ref=e872]
              - button "Сохранить" [ref=e878] [cursor=pointer]:
                - img [ref=e879]
          - generic [ref=e881]:
            - generic [ref=e883]:
              - link "PM" [ref=e884]:
                - /url: /profile/d36a73f3-5d7d-4ca1-b9ce-2da7abd6bcea
                - generic [ref=e886]: PM
              - generic [ref=e887]:
                - link "PWFP mpqyx4et1ncf" [ref=e889]:
                  - /url: /profile/d36a73f3-5d7d-4ca1-b9ce-2da7abd6bcea
                - paragraph [ref=e890]: 1 ч.
            - paragraph [ref=e893]: PW test post — feed_posts_spec
            - generic [ref=e894]:
              - button "0" [ref=e895] [cursor=pointer]:
                - img [ref=e896]
                - generic [ref=e898]: "0"
              - button "0" [ref=e899] [cursor=pointer]:
                - img [ref=e900]
                - generic [ref=e902]: "0"
              - button "Поделиться" [ref=e903] [cursor=pointer]:
                - img [ref=e904]
              - button "Сохранить" [ref=e910] [cursor=pointer]:
                - img [ref=e911]
          - generic [ref=e913]:
            - generic [ref=e915]:
              - link "PM" [ref=e916]:
                - /url: /profile/458da1fa-f239-4438-89ee-2f69af6316f4
                - generic [ref=e918]: PM
              - generic [ref=e919]:
                - generic [ref=e920]:
                  - link "PWFP mpqyvgkufsyt" [ref=e921]:
                    - /url: /profile/458da1fa-f239-4438-89ee-2f69af6316f4
                  - generic [ref=e922]:
                    - img [ref=e923]
                    - text: Опрос
                - paragraph [ref=e925]: 1 ч.
            - generic [ref=e927]:
              - generic [ref=e928]:
                - button "Option A 100% · 1" [ref=e929] [cursor=pointer]:
                  - generic [ref=e931]:
                    - generic [ref=e932]: Option A
                    - generic [ref=e933]: 100% · 1
                - button "Option B 0% · 0" [ref=e934] [cursor=pointer]:
                  - generic [ref=e935]:
                    - generic [ref=e936]: Option B
                    - generic [ref=e937]: 0% · 0
                - button "Option C 0% · 0" [ref=e938] [cursor=pointer]:
                  - generic [ref=e939]:
                    - generic [ref=e940]: Option C
                    - generic [ref=e941]: 0% · 0
                - paragraph [ref=e942]: 1 голос · до 05.06.2026
              - paragraph [ref=e943]: PW poll test
            - generic [ref=e944]:
              - button "0" [ref=e945] [cursor=pointer]:
                - img [ref=e946]
                - generic [ref=e948]: "0"
              - button "0" [ref=e949] [cursor=pointer]:
                - img [ref=e950]
                - generic [ref=e952]: "0"
              - button "Поделиться" [ref=e953] [cursor=pointer]:
                - img [ref=e954]
              - button "Сохранить" [ref=e960] [cursor=pointer]:
                - img [ref=e961]
          - generic [ref=e963]:
            - generic [ref=e965]:
              - link "PM" [ref=e966]:
                - /url: /profile/458da1fa-f239-4438-89ee-2f69af6316f4
                - generic [ref=e968]: PM
              - generic [ref=e969]:
                - link "PWFP mpqyvgkufsyt" [ref=e971]:
                  - /url: /profile/458da1fa-f239-4438-89ee-2f69af6316f4
                - paragraph [ref=e972]: 1 ч.
            - paragraph [ref=e975]: PW test post — feed_posts_spec
            - generic [ref=e976]:
              - button "0" [ref=e977] [cursor=pointer]:
                - img [ref=e978]
                - generic [ref=e980]: "0"
              - button "1" [ref=e981] [cursor=pointer]:
                - img [ref=e982]
                - generic [ref=e984]: "1"
              - button "Поделиться" [ref=e985] [cursor=pointer]:
                - img [ref=e986]
              - button "Сохранить" [ref=e992] [cursor=pointer]:
                - img [ref=e993]
          - generic [ref=e995]:
            - generic [ref=e997]:
              - link "PM" [ref=e998]:
                - /url: /profile/1b924aa5-fc93-458f-81b0-eaddf49c41ba
                - generic [ref=e1000]: PM
              - generic [ref=e1001]:
                - link "PWFP mpqyui47xfoo" [ref=e1003]:
                  - /url: /profile/1b924aa5-fc93-458f-81b0-eaddf49c41ba
                - paragraph [ref=e1004]: 1 ч.
            - paragraph [ref=e1007]: PW test post — feed_posts_spec
            - generic [ref=e1008]:
              - button "0" [ref=e1009] [cursor=pointer]:
                - img [ref=e1010]
                - generic [ref=e1012]: "0"
              - button "0" [ref=e1013] [cursor=pointer]:
                - img [ref=e1014]
                - generic [ref=e1016]: "0"
              - button "Поделиться" [ref=e1017] [cursor=pointer]:
                - img [ref=e1018]
              - button "Сохранить" [ref=e1024] [cursor=pointer]:
                - img [ref=e1025]
        - button [ref=e1027] [cursor=pointer]:
          - img [ref=e1028]
    - navigation [ref=e1029]:
      - generic [ref=e1030]:
        - link "Главная" [ref=e1031]:
          - /url: /
          - img [ref=e1034]
          - generic [ref=e1037]: Главная
        - link "Каталог" [ref=e1038]:
          - /url: /search
          - img [ref=e1040]
          - generic [ref=e1043]: Каталог
        - link "Чат" [ref=e1044]:
          - /url: /messages
          - img [ref=e1046]
          - generic [ref=e1048]: Чат
        - link "1 Друзья" [ref=e1049]:
          - /url: /friends
          - generic [ref=e1050]:
            - img [ref=e1051]
            - generic [ref=e1056]: "1"
          - generic [ref=e1057]: Друзья
        - link "Профиль" [ref=e1058]:
          - /url: /profile
          - img [ref=e1060]
          - generic [ref=e1063]: Профиль
  - generic [ref=e1065]:
    - generic [ref=e1067]:
      - generic [ref=e1068]:
        - img [ref=e1069]
        - heading "О Moooza" [level=2] [ref=e1072]
      - button [ref=e1073] [cursor=pointer]:
        - img [ref=e1074]
    - generic [ref=e1077]:
      - generic [ref=e1078]:
        - generic [ref=e1079]: Версия
        - generic [ref=e1080]: "1.0"
      - link "Пользовательское соглашение" [ref=e1081]:
        - /url: /terms
        - img [ref=e1082]
        - generic [ref=e1085]: Пользовательское соглашение
      - link "Политика конфиденциальности" [ref=e1086]:
        - /url: /privacy
        - img [ref=e1087]
        - generic [ref=e1089]: Политика конфиденциальности
      - button "Начать онбординг заново" [ref=e1090] [cursor=pointer]:
        - img [ref=e1091]
        - generic [ref=e1093]: Начать онбординг заново
      - link "Служба поддержки support@moooza.ru" [ref=e1094]:
        - /url: mailto:support@moooza.ru
        - img [ref=e1095]
        - generic [ref=e1098]:
          - paragraph [ref=e1099]: Служба поддержки
          - paragraph [ref=e1100]: support@moooza.ru
      - link "Написать в поддержку Telegram" [ref=e1101]:
        - /url: https://t.me/moooza_support
        - img [ref=e1102]
        - generic [ref=e1104]:
          - paragraph [ref=e1105]: Написать в поддержку
          - paragraph [ref=e1106]: Telegram
      - paragraph [ref=e1107]: © 2026 Moooza — Социальная сеть для музыкантов
```

# Test source

```ts
  377 |   test('unsubscribe button toggles back to subscribe', async ({ page }) => {
  378 |     if (!artistId) {
  379 |       test.skip(true, 'Artist was not created via API');
  380 |       return;
  381 |     }
  382 |     await loginUI(page, user2);
  383 |     await skipOnboarding(page);
  384 |     await page.goto(`/artist/${artistId}`);
  385 |     await page.waitForLoadState('networkidle');
  386 | 
  387 |     // Make sure we are following first
  388 |     const followBtn = page.locator('button:has-text("Подписаться")');
  389 |     const unfollowBtn = page.locator('button:has-text("Отписаться")');
  390 | 
  391 |     const followCount = await followBtn.count();
  392 |     if (followCount > 0) {
  393 |       await followBtn.click();
  394 |       await expect(unfollowBtn).toBeVisible({ timeout: 5_000 });
  395 |     }
  396 | 
  397 |     const unfollowCount = await unfollowBtn.count();
  398 |     if (unfollowCount > 0) {
  399 |       await unfollowBtn.click();
  400 |       await expect(page.locator('button:has-text("Подписаться")')).toBeVisible({ timeout: 5_000 });
  401 |     }
  402 |   });
  403 | });
  404 | 
  405 | // ── Flow settings ──────────────────────────────────────────────────────────────
  406 | 
  407 | test.describe('Flow settings', () => {
  408 |   test('/flow-settings page opens', async ({ page }) => {
  409 |     await loginUI(page, user);
  410 |     await skipOnboarding(page);
  411 |     await page.goto('/flow-settings');
  412 |     await expect(page.locator('text=Настроить Поток')).toBeVisible({ timeout: 10_000 });
  413 |   });
  414 | 
  415 |   test('post type chips are visible', async ({ page }) => {
  416 |     await loginUI(page, user);
  417 |     await skipOnboarding(page);
  418 |     await page.goto('/flow-settings');
  419 |     await expect(page.locator('button:has-text("Все")')).toBeVisible({ timeout: 10_000 });
  420 |     await expect(page.locator('button:has-text("Блог")')).toBeVisible();
  421 |   });
  422 | 
  423 |   test('period chips are visible', async ({ page }) => {
  424 |     await loginUI(page, user);
  425 |     await skipOnboarding(page);
  426 |     await page.goto('/flow-settings');
  427 |     await expect(page.locator('button:has-text("За всё время")')).toBeVisible({ timeout: 10_000 });
  428 |     await expect(page.locator('button:has-text("День")')).toBeVisible();
  429 |   });
  430 | 
  431 |   test('clicking a chip changes its active state', async ({ page }) => {
  432 |     await loginUI(page, user);
  433 |     await skipOnboarding(page);
  434 |     await page.goto('/flow-settings');
  435 |     const blogChip = page.locator('button:has-text("Блог")');
  436 |     await expect(blogChip).toBeVisible({ timeout: 10_000 });
  437 |     await blogChip.click();
  438 |     // After clicking, "Блог" chip should have bg-primary-600 class
  439 |     await expect(blogChip).toHaveClass(/bg-primary-600/);
  440 |   });
  441 | 
  442 |   test('apply button is visible', async ({ page }) => {
  443 |     await loginUI(page, user);
  444 |     await skipOnboarding(page);
  445 |     await page.goto('/flow-settings');
  446 |     await expect(page.locator('button:has-text("Применить")')).toBeVisible({ timeout: 10_000 });
  447 |   });
  448 | 
  449 |   test('apply button navigates back', async ({ page }) => {
  450 |     await loginUI(page, user);
  451 |     await skipOnboarding(page);
  452 |     // Navigate to flow-settings from home so back works
  453 |     await page.goto('/');
  454 |     await page.goto('/flow-settings');
  455 |     await page.locator('button:has-text("Применить")').click();
  456 |     // Should navigate away from /flow-settings
  457 |     await expect(page).not.toHaveURL(/\/flow-settings/, { timeout: 5_000 });
  458 |   });
  459 | });
  460 | 
  461 | // ── Info modal ─────────────────────────────────────────────────────────────────
  462 | 
  463 | test.describe('Info modal', () => {
  464 |   test('info button (ⓘ) is visible in header', async ({ page }) => {
  465 |     await loginUI(page, user);
  466 |     await skipOnboarding(page);
  467 |     // Info button is second button in header (after NotificationBell)
  468 |     const infoBtn = page.locator('header button[title="Информация"]');
  469 |     await expect(infoBtn).toBeVisible({ timeout: 10_000 });
  470 |   });
  471 | 
  472 |   test('clicking info button opens modal with О Moooza', async ({ page }) => {
  473 |     await loginUI(page, user);
  474 |     await skipOnboarding(page);
  475 |     const infoBtn = page.locator('header button[title="Информация"]');
  476 |     await infoBtn.click();
> 477 |     await expect(page.locator('text=О Moooza')).toBeVisible({ timeout: 5_000 });
      |                                                 ^ Error: expect(locator).toBeVisible() failed
  478 |   });
  479 | 
  480 |   test('info modal contains Terms and Privacy links', async ({ page }) => {
  481 |     await loginUI(page, user);
  482 |     await skipOnboarding(page);
  483 |     const infoBtn = page.locator('header button[title="Информация"]');
  484 |     await infoBtn.click();
  485 |     await expect(page.locator('text=Пользовательское соглашение')).toBeVisible({ timeout: 5_000 });
  486 |     await expect(page.locator('text=Политика конфиденциальности')).toBeVisible();
  487 |   });
  488 | 
  489 |   test('info modal contains onboarding restart button', async ({ page }) => {
  490 |     await loginUI(page, user);
  491 |     await skipOnboarding(page);
  492 |     const infoBtn = page.locator('header button[title="Информация"]');
  493 |     await infoBtn.click();
  494 |     await expect(page.locator('text=Начать онбординг заново')).toBeVisible({ timeout: 5_000 });
  495 |   });
  496 | 
  497 |   test('clicking "Начать онбординг заново" closes modal and goes to /onboarding', async ({ page }) => {
  498 |     await loginUI(page, user);
  499 |     await skipOnboarding(page);
  500 |     const infoBtn = page.locator('header button[title="Информация"]');
  501 |     await infoBtn.click();
  502 |     await expect(page.locator('text=Начать онбординг заново')).toBeVisible({ timeout: 5_000 });
  503 |     await page.locator('button:has-text("Начать онбординг заново")').click();
  504 |     await expect(page).toHaveURL(/\/onboarding/, { timeout: 8_000 });
  505 |     // Modal should be gone
  506 |     await expect(page.locator('text=О Moooza')).not.toBeVisible({ timeout: 3_000 });
  507 |   });
  508 | 
  509 |   test('X button closes info modal', async ({ page }) => {
  510 |     await loginUI(page, user);
  511 |     await skipOnboarding(page);
  512 |     const infoBtn = page.locator('header button[title="Информация"]');
  513 |     await infoBtn.click();
  514 |     await expect(page.locator('text=О Moooza')).toBeVisible({ timeout: 5_000 });
  515 |     // Find X button inside the modal
  516 |     const closeBtn = page.locator('button').filter({ has: page.locator('svg') }).nth(3);
  517 |     // More precisely: look for a button that is inside the modal overlay area
  518 |     const modalCloseBtn = page.locator('div[class*="fixed"][class*="inset-x-0"][class*="bottom-0"] button').first();
  519 |     await modalCloseBtn.click();
  520 |     await expect(page.locator('text=О Moooza')).not.toBeVisible({ timeout: 5_000 });
  521 |   });
  522 | });
  523 | 
```