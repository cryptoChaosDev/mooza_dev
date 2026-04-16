-- Allow multiple connections between the same pair of users
ALTER TABLE "Connection" DROP CONSTRAINT IF EXISTS "Connection_requesterId_receiverId_key";
