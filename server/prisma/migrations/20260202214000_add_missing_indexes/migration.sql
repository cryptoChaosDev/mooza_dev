-- Add missing indexes for User table
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_city_idx" ON "User"("city");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_fieldOfActivityId_idx" ON "User"("fieldOfActivityId");

-- Add missing indexes for Profession table
CREATE INDEX "Profession_fieldOfActivityId_idx" ON "Profession"("fieldOfActivityId");

-- Add missing indexes for UserProfession table
CREATE INDEX "UserProfession_userId_idx" ON "UserProfession"("userId");
CREATE INDEX "UserProfession_professionId_idx" ON "UserProfession"("professionId");

-- Add missing indexes for UserArtist table
CREATE INDEX "UserArtist_userId_idx" ON "UserArtist"("userId");
CREATE INDEX "UserArtist_artistId_idx" ON "UserArtist"("artistId");

-- Add missing indexes for Post table
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- Add missing indexes for Like table
CREATE INDEX "Like_postId_idx" ON "Like"("postId");

-- Add missing indexes for Comment table
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- Add missing indexes for Message table
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX "Message_receiverId_idx" ON "Message"("receiverId");
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- Add missing indexes for Friendship table
CREATE INDEX "Friendship_requesterId_idx" ON "Friendship"("requesterId");
CREATE INDEX "Friendship_receiverId_idx" ON "Friendship"("receiverId");
CREATE INDEX "Friendship_status_idx" ON "Friendship"("status");
