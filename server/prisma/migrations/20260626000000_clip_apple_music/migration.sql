-- Add Apple Music as a clip platform (music videos imported from iTunes).
ALTER TYPE "ClipPlatform" ADD VALUE IF NOT EXISTS 'APPLE_MUSIC';
