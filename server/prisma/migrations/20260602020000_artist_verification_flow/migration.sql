-- Phase 3: single-stage artist verification flow.

-- Creator's declared relationship roles (Музыкант/Менеджер/Директор/Представитель группы/Лейбл).
ALTER TABLE "Artist" ADD COLUMN "submitterRoles" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: under the new VERIFIED-only catalog rule, keep existing approved artists visible.
UPDATE "Artist" SET status = 'VERIFIED' WHERE status = 'APPROVED';
