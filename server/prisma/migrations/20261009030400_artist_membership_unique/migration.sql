-- Не больше одной «живой» (PENDING/ACCEPTED) строки участия на пару
-- пользователь–артист. Старый @@unique([userId, artistId, professionId]) не
-- работал: professionId у новых строк NULL, а Postgres не считает NULL равными —
-- двойной клик по «Запросить участие» создавал дубли.
--
-- Сначала схлопываем существующие дубли: оставляем одну строку (владелец →
-- админ → ACCEPTED → самая ранняя), остальные переводим в ARCHIVED (не удаляем —
-- история сохраняется; в составе и заявках ARCHIVED не показывается).
WITH ranked AS (
    SELECT "id",
           row_number() OVER (
               PARTITION BY "userId", "artistId"
               ORDER BY "isOwner" DESC, "isAdmin" DESC, ("inviteStatus" = 'ACCEPTED') DESC, "createdAt" ASC, "id" ASC
           ) AS rn
      FROM "UserArtist"
     WHERE "inviteStatus" IN ('PENDING', 'ACCEPTED')
)
UPDATE "UserArtist" u
   SET "inviteStatus" = 'ARCHIVED'
  FROM ranked r
 WHERE u."id" = r."id"
   AND r.rn > 1;

-- Частичный уникальный индекс (Prisma-схема частичные индексы не описывает —
-- как и "User_nicknameNorm_unique", он живёт только в миграции).
CREATE UNIQUE INDEX IF NOT EXISTS "UserArtist_live_userId_artistId_key"
    ON "UserArtist"("userId", "artistId")
    WHERE "inviteStatus" IN ('PENDING', 'ACCEPTED');

-- Защита по умолчанию: строка участия без явного статуса — заявка (PENDING),
-- а не подтверждённое участие. Весь код артистов задаёт статус явно; прежний
-- DEFAULT 'ACCEPTED' позволял любому месту, забывшему статус (например,
-- artistIds[] при регистрации), молча зачислять в состав любого артиста.
ALTER TABLE "UserArtist" ALTER COLUMN "inviteStatus" SET DEFAULT 'PENDING';
