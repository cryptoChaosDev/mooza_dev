-- Add missing indexes (IF NOT EXISTS prevents conflicts with prior migrations)
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_city_idx" ON "User"("city");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_fieldOfActivityId_idx" ON "User"("fieldOfActivityId");

CREATE INDEX IF NOT EXISTS "Profession_fieldOfActivityId_idx" ON "Profession"("fieldOfActivityId");

CREATE INDEX IF NOT EXISTS "UserProfession_userId_idx" ON "UserProfession"("userId");
CREATE INDEX IF NOT EXISTS "UserProfession_professionId_idx" ON "UserProfession"("professionId");

CREATE INDEX IF NOT EXISTS "UserArtist_userId_idx" ON "UserArtist"("userId");
CREATE INDEX IF NOT EXISTS "UserArtist_artistId_idx" ON "UserArtist"("artistId");

CREATE INDEX IF NOT EXISTS "Post_authorId_idx" ON "Post"("authorId");
CREATE INDEX IF NOT EXISTS "Post_createdAt_idx" ON "Post"("createdAt");

CREATE INDEX IF NOT EXISTS "Like_postId_idx" ON "Like"("postId");

CREATE INDEX IF NOT EXISTS "Comment_postId_idx" ON "Comment"("postId");
CREATE INDEX IF NOT EXISTS "Comment_authorId_idx" ON "Comment"("authorId");

CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "Message_receiverId_idx" ON "Message"("receiverId");
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");

CREATE INDEX IF NOT EXISTS "Friendship_requesterId_idx" ON "Friendship"("requesterId");
CREATE INDEX IF NOT EXISTS "Friendship_receiverId_idx" ON "Friendship"("receiverId");
CREATE INDEX IF NOT EXISTS "Friendship_status_idx" ON "Friendship"("status");
