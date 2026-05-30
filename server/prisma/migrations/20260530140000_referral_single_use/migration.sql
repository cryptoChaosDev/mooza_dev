-- Make referral links single-use: drop the signups counter, add consumption tracking
ALTER TABLE "ReferralLink" DROP COLUMN IF EXISTS "signups";

ALTER TABLE "ReferralLink" ADD COLUMN "usedById" TEXT;
ALTER TABLE "ReferralLink" ADD COLUMN "usedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ReferralLink_usedById_key" ON "ReferralLink"("usedById");

ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_usedById_fkey"
    FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
