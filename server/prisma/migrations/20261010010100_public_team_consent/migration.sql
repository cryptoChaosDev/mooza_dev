-- Гостевой режим: официальный командный аккаунт Moooza (team@moooza.ru) —
-- публичный по умолчанию (его посты — приветственные/официальные, это аккаунт
-- компании, а не частного лица). Идемпотентно: ничего не делает, если такого
-- пользователя нет или согласие уже стоит.

UPDATE "User"
SET "publicConsentAt" = CURRENT_TIMESTAMP,
    "publicConsentVersion" = '2026-05-31'
WHERE "email" = 'team@moooza.ru'
  AND "publicConsentAt" IS NULL;

-- Запись в журнал согласий (фиксированный id — повторный прогон не дублирует).
INSERT INTO "ConsentEvent" ("id", "userId", "type", "action", "version", "source", "createdAt")
SELECT 'migration-team-public-consent-20261010', u."id", 'pd_public', 'grant', '2026-05-31', 'migration', CURRENT_TIMESTAMP
FROM "User" u
WHERE u."email" = 'team@moooza.ru'
ON CONFLICT ("id") DO NOTHING;
