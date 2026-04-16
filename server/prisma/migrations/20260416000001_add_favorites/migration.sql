CREATE TABLE "Favorite" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"    TEXT NOT NULL,
  "targetId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Favorite_userId_targetId_key" UNIQUE ("userId", "targetId"),
  CONSTRAINT "Favorite_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Favorite_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");
