-- Structured "Услуга" post → the UserService offering it advertises.
ALTER TABLE "Post" ADD COLUMN "serviceId" TEXT;
CREATE INDEX "Post_serviceId_idx" ON "Post"("serviceId");
ALTER TABLE "Post" ADD CONSTRAINT "Post_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "UserService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
