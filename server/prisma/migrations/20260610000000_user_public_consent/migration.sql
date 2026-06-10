-- Consent to processing PD allowed for public distribution (152-ФЗ ст. 10.1),
-- obtained once at the first public action (service / portfolio / public contacts).
ALTER TABLE "User" ADD COLUMN "publicConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "publicConsentVersion" TEXT;
