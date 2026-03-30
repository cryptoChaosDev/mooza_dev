-- CreateTable: Conversation
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ConversationMember
CREATE TABLE "ConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Message — add new columns, make receiverId nullable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "isEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Message" ALTER COLUMN "receiverId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");
CREATE INDEX IF NOT EXISTS "ConversationMember_userId_idx" ON "ConversationMember"("userId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: create Conversation for each existing DM pair
DO $$
DECLARE
  pair RECORD;
  conv_id TEXT;
  existing_conv_id TEXT;
BEGIN
  FOR pair IN (
    SELECT DISTINCT
      LEAST("senderId", "receiverId") AS user1,
      GREATEST("senderId", "receiverId") AS user2
    FROM "Message"
    WHERE "receiverId" IS NOT NULL
      AND "conversationId" IS NULL
  ) LOOP
    -- Check if a DM conversation already exists for this pair
    SELECT cm1."conversationId" INTO existing_conv_id
    FROM "ConversationMember" cm1
    JOIN "ConversationMember" cm2
      ON cm1."conversationId" = cm2."conversationId"
    JOIN "Conversation" c ON c.id = cm1."conversationId"
    WHERE cm1."userId" = pair.user1
      AND cm2."userId" = pair.user2
      AND c."isGroup" = false
    LIMIT 1;

    IF existing_conv_id IS NULL THEN
      -- Generate a new UUID for the conversation
      conv_id := gen_random_uuid()::text;

      INSERT INTO "Conversation" (id, "isGroup", "createdAt", "updatedAt")
      VALUES (conv_id, false, NOW(), NOW());

      INSERT INTO "ConversationMember" (id, "conversationId", "userId", "isAdmin", "joinedAt")
      VALUES (gen_random_uuid()::text, conv_id, pair.user1, false, NOW());

      INSERT INTO "ConversationMember" (id, "conversationId", "userId", "isAdmin", "joinedAt")
      VALUES (gen_random_uuid()::text, conv_id, pair.user2, false, NOW());
    ELSE
      conv_id := existing_conv_id;
    END IF;

    -- Assign conversationId to all messages in this pair
    UPDATE "Message"
    SET "conversationId" = conv_id
    WHERE (
      ("senderId" = pair.user1 AND "receiverId" = pair.user2)
      OR ("senderId" = pair.user2 AND "receiverId" = pair.user1)
    )
    AND "conversationId" IS NULL;
  END LOOP;
END $$;
