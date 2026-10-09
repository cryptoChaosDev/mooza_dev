-- «Лист ожидания»: приглашения из админки и отметка «Зарегистрировался».
-- Аддитивно и идемпотентно (IF NOT EXISTS) — повторный прогон безопасен,
-- существующие колонки/данные не меняются. В схеме есть GENERATED-колонки
-- (*Norm) — применять ТОЛЬКО через prisma migrate deploy, не db push.

-- WaitlistEntry: статус приглашения (new → invited → registered) и служебные даты.
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3);
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "invitedById" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "invitesSent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "referralLinkId" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "registeredUserId" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "registeredAt" TIMESTAMP(3);
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "WaitlistEntry_status_idx" ON "WaitlistEntry"("status");

-- ReferralLink.source: 'waitlist' — приглашение из листа ожидания
-- (не засчитывается в реферальный Pro владельца). NULL — обычная ссылка.
ALTER TABLE "ReferralLink" ADD COLUMN IF NOT EXISTS "source" TEXT;
