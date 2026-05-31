-- Per-user contacts visibility (default visible). Owner can hide their contacts.
ALTER TABLE "User" ADD COLUMN "contactsVisible" BOOLEAN NOT NULL DEFAULT true;
