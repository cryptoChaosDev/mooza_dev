-- CreateIndex
CREATE INDEX "Friendship_receiverId_status_idx" ON "Friendship"("receiverId", "status");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Message_receiverId_readAt_idx" ON "Message"("receiverId", "readAt");

-- CreateIndex
CREATE INDEX "Message_senderId_receiverId_createdAt_idx" ON "Message"("senderId", "receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "User_employerId_idx" ON "User"("employerId");
