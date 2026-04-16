-- CreateEnum
CREATE TYPE "GroupInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable UserArtist
ALTER TABLE "UserArtist"
  ADD COLUMN "isOwner"      BOOLEAN             NOT NULL DEFAULT false,
  ADD COLUMN "professionId" TEXT,
  ADD COLUMN "inviteStatus" "GroupInviteStatus"  NOT NULL DEFAULT 'ACCEPTED',
  ADD COLUMN "invitedById"  TEXT;

-- AddForeignKey
ALTER TABLE "UserArtist"
  ADD CONSTRAINT "UserArtist_professionId_fkey"
  FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArtist"
  ADD CONSTRAINT "UserArtist_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (fix missing cascade on artistId)
ALTER TABLE "UserArtist" DROP CONSTRAINT IF EXISTS "UserArtist_artistId_fkey";
ALTER TABLE "UserArtist"
  ADD CONSTRAINT "UserArtist_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "UserArtist_inviteStatus_idx" ON "UserArtist"("inviteStatus");
