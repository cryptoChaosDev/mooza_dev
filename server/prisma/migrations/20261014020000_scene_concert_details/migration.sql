-- AlterTable
ALTER TABLE "Concert" ADD COLUMN     "ageLimit" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "detailsFetchedAt" TIMESTAMP(3),
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "organizer" TEXT,
ADD COLUMN     "posterUrl" TEXT;

