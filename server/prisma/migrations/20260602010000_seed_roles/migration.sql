-- Seed the Role catalog (collective / release / clip).
-- Idempotent: re-runnable; gen_random_uuid() is built into PG16 (no extension needed).
-- Reference data must live in a migration because `prisma db seed` is a no-op on deploy.

-- ============ context: COLLECTIVE ============
-- category: Музыканты
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Вокалист', 'COLLECTIVE', 'Музыканты', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Рэп-вокалист', 'COLLECTIVE', 'Музыканты', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Бэк-вокалист', 'COLLECTIVE', 'Музыканты', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Экстрим-вокалист', 'COLLECTIVE', 'Музыканты', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гитарист', 'COLLECTIVE', 'Музыканты', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Бас-гитарист', 'COLLECTIVE', 'Музыканты', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Барабанщик', 'COLLECTIVE', 'Музыканты', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Клавишник', 'COLLECTIVE', 'Музыканты', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Пианист', 'COLLECTIVE', 'Музыканты', 8) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Диджей', 'COLLECTIVE', 'Музыканты', 9) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Перкуссионист', 'COLLECTIVE', 'Музыканты', 10) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Скрипач', 'COLLECTIVE', 'Музыканты', 11) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Альтист', 'COLLECTIVE', 'Музыканты', 12) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Виолончелист', 'COLLECTIVE', 'Музыканты', 13) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Контрабасист', 'COLLECTIVE', 'Музыканты', 14) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Арфист', 'COLLECTIVE', 'Музыканты', 15) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Трубач', 'COLLECTIVE', 'Музыканты', 16) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Тромбонист', 'COLLECTIVE', 'Музыканты', 17) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Валторнист', 'COLLECTIVE', 'Музыканты', 18) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Тубист', 'COLLECTIVE', 'Музыканты', 19) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Саксофонист', 'COLLECTIVE', 'Музыканты', 20) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Флейтист', 'COLLECTIVE', 'Музыканты', 21) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Кларнетист', 'COLLECTIVE', 'Музыканты', 22) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гобоист', 'COLLECTIVE', 'Музыканты', 23) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Фаготист', 'COLLECTIVE', 'Музыканты', 24) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Балалаечник', 'COLLECTIVE', 'Музыканты', 25) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Домрист', 'COLLECTIVE', 'Музыканты', 26) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гусляр', 'COLLECTIVE', 'Музыканты', 27) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Баянист', 'COLLECTIVE', 'Музыканты', 28) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Аккордеонист', 'COLLECTIVE', 'Музыканты', 29) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гармонист', 'COLLECTIVE', 'Музыканты', 30) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Банджоист', 'COLLECTIVE', 'Музыканты', 31) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Мандолинист', 'COLLECTIVE', 'Музыканты', 32) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Укулелист', 'COLLECTIVE', 'Музыканты', 33) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Ситарист', 'COLLECTIVE', 'Музыканты', 34) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дудукист', 'COLLECTIVE', 'Музыканты', 35) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Волынщик', 'COLLECTIVE', 'Музыканты', 36) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Варганист', 'COLLECTIVE', 'Музыканты', 37) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Сессионный музыкант', 'COLLECTIVE', 'Музыканты', 38) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Команда артиста
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Автор музыки', 'COLLECTIVE', 'Команда артиста', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Автор текста', 'COLLECTIVE', 'Команда артиста', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Сонграйтер', 'COLLECTIVE', 'Команда артиста', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Композитор', 'COLLECTIVE', 'Команда артиста', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Аранжировщик', 'COLLECTIVE', 'Команда артиста', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Битмейкер', 'COLLECTIVE', 'Команда артиста', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Менеджер артиста', 'COLLECTIVE', 'Команда артиста', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Директор артиста', 'COLLECTIVE', 'Команда артиста', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Концертный директор', 'COLLECTIVE', 'Команда артиста', 8) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Букинг-менеджер', 'COLLECTIVE', 'Команда артиста', 9) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'PR-менеджер', 'COLLECTIVE', 'Команда артиста', 10) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'SMM-менеджер', 'COLLECTIVE', 'Команда артиста', 11) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Контент-менеджер', 'COLLECTIVE', 'Команда артиста', 12) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Продюсер артиста', 'COLLECTIVE', 'Команда артиста', 13) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Музыкальный продюсер', 'COLLECTIVE', 'Команда артиста', 14) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Исполнительный продюсер', 'COLLECTIVE', 'Команда артиста', 15) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Саунд-продюсер', 'COLLECTIVE', 'Команда артиста', 16) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Арт-директор', 'COLLECTIVE', 'Команда артиста', 17) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Креативный директор', 'COLLECTIVE', 'Команда артиста', 18) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Стилист', 'COLLECTIVE', 'Команда артиста', 19) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Визажист', 'COLLECTIVE', 'Команда артиста', 20) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Фотограф', 'COLLECTIVE', 'Команда артиста', 21) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Видеограф', 'COLLECTIVE', 'Команда артиста', 22) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дизайнер', 'COLLECTIVE', 'Команда артиста', 23) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Мерч-менеджер', 'COLLECTIVE', 'Команда артиста', 24) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Тур-менеджер', 'COLLECTIVE', 'Команда артиста', 25) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Техник / роуди', 'COLLECTIVE', 'Команда артиста', 26) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Звукорежиссёр концертов', 'COLLECTIVE', 'Команда артиста', 27) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Студийный звукорежиссёр', 'COLLECTIVE', 'Команда артиста', 28) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Светорежиссёр', 'COLLECTIVE', 'Команда артиста', 29) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Юрист', 'COLLECTIVE', 'Команда артиста', 30) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Бухгалтер', 'COLLECTIVE', 'Команда артиста', 31) ON CONFLICT ("context","category","name") DO NOTHING;

-- ============ context: RELEASE ============
-- category: Творческие роли
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Основной артист', 'RELEASE', 'Творческие роли', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Приглашённый артист / feat', 'RELEASE', 'Творческие роли', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Исполнитель', 'RELEASE', 'Творческие роли', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Вокалист', 'RELEASE', 'Творческие роли', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Рэп-вокалист', 'RELEASE', 'Творческие роли', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Бэк-вокалист', 'RELEASE', 'Творческие роли', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Хорист', 'RELEASE', 'Творческие роли', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Автор музыки', 'RELEASE', 'Творческие роли', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Автор текста', 'RELEASE', 'Творческие роли', 8) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Сонграйтер', 'RELEASE', 'Творческие роли', 9) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Композитор', 'RELEASE', 'Творческие роли', 10) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Аранжировщик', 'RELEASE', 'Творческие роли', 11) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Битмейкер', 'RELEASE', 'Творческие роли', 12) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Музыкальный продюсер', 'RELEASE', 'Творческие роли', 13) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Саунд-продюсер', 'RELEASE', 'Творческие роли', 14) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Инструментальные роли
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гитарист', 'RELEASE', 'Инструментальные роли', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Бас-гитарист', 'RELEASE', 'Инструментальные роли', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Барабанщик', 'RELEASE', 'Инструментальные роли', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Клавишник', 'RELEASE', 'Инструментальные роли', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Пианист', 'RELEASE', 'Инструментальные роли', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Диджей', 'RELEASE', 'Инструментальные роли', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Перкуссионист', 'RELEASE', 'Инструментальные роли', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Скрипач', 'RELEASE', 'Инструментальные роли', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Альтист', 'RELEASE', 'Инструментальные роли', 8) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Виолончелист', 'RELEASE', 'Инструментальные роли', 9) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Контрабасист', 'RELEASE', 'Инструментальные роли', 10) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Арфист', 'RELEASE', 'Инструментальные роли', 11) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Трубач', 'RELEASE', 'Инструментальные роли', 12) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Тромбонист', 'RELEASE', 'Инструментальные роли', 13) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Валторнист', 'RELEASE', 'Инструментальные роли', 14) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Тубист', 'RELEASE', 'Инструментальные роли', 15) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Саксофонист', 'RELEASE', 'Инструментальные роли', 16) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Флейтист', 'RELEASE', 'Инструментальные роли', 17) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Кларнетист', 'RELEASE', 'Инструментальные роли', 18) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гобоист', 'RELEASE', 'Инструментальные роли', 19) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Фаготист', 'RELEASE', 'Инструментальные роли', 20) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Балалаечник', 'RELEASE', 'Инструментальные роли', 21) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Домрист', 'RELEASE', 'Инструментальные роли', 22) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гусляр', 'RELEASE', 'Инструментальные роли', 23) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Баянист', 'RELEASE', 'Инструментальные роли', 24) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Аккордеонист', 'RELEASE', 'Инструментальные роли', 25) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гармонист', 'RELEASE', 'Инструментальные роли', 26) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Банджоист', 'RELEASE', 'Инструментальные роли', 27) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Мандолинист', 'RELEASE', 'Инструментальные роли', 28) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Укулелист', 'RELEASE', 'Инструментальные роли', 29) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Ситарист', 'RELEASE', 'Инструментальные роли', 30) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дудукист', 'RELEASE', 'Инструментальные роли', 31) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Волынщик', 'RELEASE', 'Инструментальные роли', 32) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Варганист', 'RELEASE', 'Инструментальные роли', 33) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Конгист', 'RELEASE', 'Инструментальные роли', 34) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Бонгист', 'RELEASE', 'Инструментальные роли', 35) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Джембист', 'RELEASE', 'Инструментальные роли', 36) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дарбукист', 'RELEASE', 'Инструментальные роли', 37) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Тамбуринист', 'RELEASE', 'Инструментальные роли', 38) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Сессионный музыкант', 'RELEASE', 'Инструментальные роли', 39) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Инструменталист', 'RELEASE', 'Инструментальные роли', 40) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дирижёр', 'RELEASE', 'Инструментальные роли', 41) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Студия
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Звукорежиссёр записи', 'RELEASE', 'Студия', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Инженер записи вокала', 'RELEASE', 'Студия', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Инженер записи инструментов', 'RELEASE', 'Студия', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Редактор вокала', 'RELEASE', 'Студия', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Тюнер вокала', 'RELEASE', 'Студия', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Инженер сведения', 'RELEASE', 'Студия', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Инженер мастеринга', 'RELEASE', 'Студия', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Ассистент звукорежиссёра', 'RELEASE', 'Студия', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Студия записи', 'RELEASE', 'Студия', 8) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Визуал и выпуск
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дизайнер обложки', 'RELEASE', 'Визуал и выпуск', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Иллюстратор', 'RELEASE', 'Визуал и выпуск', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Фотограф', 'RELEASE', 'Визуал и выпуск', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Ретушёр', 'RELEASE', 'Визуал и выпуск', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Арт-директор', 'RELEASE', 'Визуал и выпуск', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Моушн-дизайнер', 'RELEASE', 'Визуал и выпуск', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Видео-дизайнер / визуалайзер', 'RELEASE', 'Визуал и выпуск', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Лейбл', 'RELEASE', 'Визуал и выпуск', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дистрибьютор', 'RELEASE', 'Визуал и выпуск', 8) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'A&R', 'RELEASE', 'Визуал и выпуск', 9) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Продюсер релиза', 'RELEASE', 'Визуал и выпуск', 10) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Исполнительный продюсер', 'RELEASE', 'Визуал и выпуск', 11) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Менеджер релиза', 'RELEASE', 'Визуал и выпуск', 12) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'PR-менеджер', 'RELEASE', 'Визуал и выпуск', 13) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'SMM-менеджер', 'RELEASE', 'Визуал и выпуск', 14) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Таргетолог', 'RELEASE', 'Визуал и выпуск', 15) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Плейлист-питчер', 'RELEASE', 'Визуал и выпуск', 16) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Радиопромоутер', 'RELEASE', 'Визуал и выпуск', 17) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Копирайтер', 'RELEASE', 'Визуал и выпуск', 18) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Юрист', 'RELEASE', 'Визуал и выпуск', 19) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Издатель / паблишер', 'RELEASE', 'Визуал и выпуск', 20) ON CONFLICT ("context","category","name") DO NOTHING;

-- ============ context: CLIP ============
-- category: Творческие роли
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Артист', 'CLIP', 'Творческие роли', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Приглашённый артист', 'CLIP', 'Творческие роли', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Режиссёр', 'CLIP', 'Творческие роли', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Креативный продюсер', 'CLIP', 'Творческие роли', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Сценарист', 'CLIP', 'Творческие роли', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Автор идеи', 'CLIP', 'Творческие роли', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Раскадровщик', 'CLIP', 'Творческие роли', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Хореограф', 'CLIP', 'Творческие роли', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Постановщик движения', 'CLIP', 'Творческие роли', 8) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Актёр', 'CLIP', 'Творческие роли', 9) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Массовка', 'CLIP', 'Творческие роли', 10) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Продакшн
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Продюсер клипа', 'CLIP', 'Продакшн', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Исполнительный продюсер', 'CLIP', 'Продакшн', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Линейный продюсер', 'CLIP', 'Продакшн', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Продакшн-менеджер', 'CLIP', 'Продакшн', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Координатор съёмки', 'CLIP', 'Продакшн', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Локейшн-менеджер', 'CLIP', 'Продакшн', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Кастинг-директор', 'CLIP', 'Продакшн', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Администратор площадки', 'CLIP', 'Продакшн', 7) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Съёмочная группа
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Оператор-постановщик', 'CLIP', 'Съёмочная группа', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Оператор', 'CLIP', 'Съёмочная группа', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Второй оператор', 'CLIP', 'Съёмочная группа', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Фокус-пуллер', 'CLIP', 'Съёмочная группа', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Камера-ассистент', 'CLIP', 'Съёмочная группа', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гаффер / главный осветитель', 'CLIP', 'Съёмочная группа', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Осветитель', 'CLIP', 'Съёмочная группа', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Грип', 'CLIP', 'Съёмочная группа', 7) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Звукорежиссёр на площадке', 'CLIP', 'Съёмочная группа', 8) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Плейбек-инженер', 'CLIP', 'Съёмочная группа', 9) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дрон-оператор', 'CLIP', 'Съёмочная группа', 10) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Фотограф бэкстейджа', 'CLIP', 'Съёмочная группа', 11) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Видеограф бэкстейджа', 'CLIP', 'Съёмочная группа', 12) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Образ и декорации
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Художник-постановщик', 'CLIP', 'Образ и декорации', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Декоратор', 'CLIP', 'Образ и декорации', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Реквизитор', 'CLIP', 'Образ и декорации', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Стилист', 'CLIP', 'Образ и декорации', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Костюмер', 'CLIP', 'Образ и декорации', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Визажист', 'CLIP', 'Образ и декорации', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Гримёр', 'CLIP', 'Образ и декорации', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Парикмахер', 'CLIP', 'Образ и декорации', 7) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Постпродакшн
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Монтажёр', 'CLIP', 'Постпродакшн', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Цветокорректор', 'CLIP', 'Постпродакшн', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'VFX-специалист', 'CLIP', 'Постпродакшн', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'CGI-специалист', 'CLIP', 'Постпродакшн', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Моушн-дизайнер', 'CLIP', 'Постпродакшн', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Саунд-дизайнер', 'CLIP', 'Постпродакшн', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Титровщик', 'CLIP', 'Постпродакшн', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Постпродакшн-продюсер', 'CLIP', 'Постпродакшн', 7) ON CONFLICT ("context","category","name") DO NOTHING;

-- category: Продвижение
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'PR-менеджер', 'CLIP', 'Продвижение', 0) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'SMM-менеджер', 'CLIP', 'Продвижение', 1) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Таргетолог', 'CLIP', 'Продвижение', 2) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'YouTube-специалист', 'CLIP', 'Продвижение', 3) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Дизайнер превью', 'CLIP', 'Продвижение', 4) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Копирайтер', 'CLIP', 'Продвижение', 5) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Паблишер / правообладатель', 'CLIP', 'Продвижение', 6) ON CONFLICT ("context","category","name") DO NOTHING;
INSERT INTO "Role" ("id","name","context","category","sortOrder") VALUES (gen_random_uuid()::text, 'Юрист', 'CLIP', 'Продвижение', 7) ON CONFLICT ("context","category","name") DO NOTHING;

