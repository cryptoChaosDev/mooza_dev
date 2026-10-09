-- Права на артиста теперь только через UserArtist.isOwner/isAdmin (раньше
-- пользователь из Artist.submittedById дополнительно считался владельцем —
-- «isCreator» в GET /api/artists/:id и легаси /api/groups).
--
-- Чтобы легаси-артисты без строки владельца не остались без управления:
-- если у артиста НЕТ подтверждённого владельца, а пользователь из submittedById
-- — его подтверждённый участник, делаем эту строку владельцем (и админом).
-- Новых строк участия не создаём (бывший/исключённый участник не получит прав).
-- Идемпотентно; выполняется после схлопывания дублей участия (…030400).
UPDATE "UserArtist" ua
   SET "isOwner" = true, "isAdmin" = true
  FROM "Artist" a
 WHERE ua."artistId" = a."id"
   AND a."submittedById" IS NOT NULL
   AND ua."userId" = a."submittedById"
   AND ua."inviteStatus" = 'ACCEPTED'
   AND NOT EXISTS (
       SELECT 1 FROM "UserArtist" o
        WHERE o."artistId" = a."id" AND o."isOwner" = true AND o."inviteStatus" = 'ACCEPTED'
   );
