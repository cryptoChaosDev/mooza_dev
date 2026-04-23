ALTER TABLE "Comment" ADD COLUMN "parentCommentId" TEXT;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");
