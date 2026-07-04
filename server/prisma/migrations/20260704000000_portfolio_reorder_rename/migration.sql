-- Portfolio files: custom display name (title) + manual ordering (sortOrder).
ALTER TABLE "PortfolioFile" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "PortfolioFile" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Give existing files a stable per-user order (by upload time) so the new
-- single-key orderBy: { sortOrder } renders them deterministically.
UPDATE "PortfolioFile" AS pf
SET "sortOrder" = sub.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC) - 1) AS rn
  FROM "PortfolioFile"
) AS sub
WHERE pf.id = sub.id;
