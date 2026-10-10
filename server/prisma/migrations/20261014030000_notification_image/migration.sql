-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "imageUrl" TEXT;


-- Уже отправленные уведомления «Сцены» о концертах — афиша концерта.
UPDATE "Notification" n
SET "imageUrl" = c."imageUrl"
FROM "Concert" c
WHERE n.type = 'scene_concert' AND n."imageUrl" IS NULL AND c."imageUrl" IS NOT NULL
  AND n.link = '/concerts/' || c.id;
