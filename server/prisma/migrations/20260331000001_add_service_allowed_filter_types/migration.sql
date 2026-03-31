-- Add allowedFilterTypes column to Service for system filter type keys
ALTER TABLE "Service" ADD COLUMN "allowedFilterTypes" TEXT[] NOT NULL DEFAULT '{}';
