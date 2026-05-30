-- ReferralLink: user-generated named referral links
CREATE TABLE "ReferralLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralLink_code_key" ON "ReferralLink"("code");
CREATE INDEX "ReferralLink_ownerId_idx" ON "ReferralLink"("ownerId");
CREATE INDEX "ReferralLink_code_idx" ON "ReferralLink"("code");

ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Track which referral-link code a user signed up through
ALTER TABLE "User" ADD COLUMN "referralLinkUsed" TEXT;
