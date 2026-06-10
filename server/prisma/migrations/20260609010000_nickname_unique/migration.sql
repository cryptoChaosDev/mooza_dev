-- Enforce case/ё-insensitive nickname uniqueness via the generated nicknameNorm
-- column. Partial: users without a nickname (NULL/empty) are not constrained
-- (their nicknameNorm is '' and Postgres would otherwise reject all but one).
CREATE UNIQUE INDEX IF NOT EXISTS "User_nicknameNorm_unique"
  ON "User" ("nicknameNorm")
  WHERE "nickname" IS NOT NULL AND "nickname" <> '';
