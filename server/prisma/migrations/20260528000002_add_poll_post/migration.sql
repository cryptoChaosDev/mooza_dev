ALTER TABLE "Post" ADD COLUMN "pollOptions" JSONB;
ALTER TABLE "Post" ADD COLUMN "pollEndsAt" TIMESTAMP(3);

CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PollVote_postId_userId_key" ON "PollVote"("postId", "userId");
CREATE INDEX "PollVote_postId_idx" ON "PollVote"("postId");

ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
