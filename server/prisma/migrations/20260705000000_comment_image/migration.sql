-- Add optional image to comments
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
