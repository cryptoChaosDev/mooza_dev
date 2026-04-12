ALTER TABLE "Message" ADD COLUMN "deliveredAt" TIMESTAMP(3);
CREATE INDEX "Message_conversationId_deliveredAt_idx" ON "Message"("conversationId", "deliveredAt");
