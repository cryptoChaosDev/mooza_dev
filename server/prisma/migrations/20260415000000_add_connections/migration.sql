-- Add ConnectionStatus enum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BREAK_REQUESTED');

-- Create Connection table
CREATE TABLE "Connection" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid(),
  "requesterId"       TEXT NOT NULL,
  "receiverId"        TEXT NOT NULL,
  "status"            "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "breakRequestedBy"  TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Connection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Connection_requesterId_receiverId_key" UNIQUE ("requesterId", "receiverId"),
  CONSTRAINT "Connection_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Connection_receiverId_fkey"  FOREIGN KEY ("receiverId")  REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "Connection_requesterId_idx" ON "Connection"("requesterId");
CREATE INDEX "Connection_receiverId_idx"  ON "Connection"("receiverId");
CREATE INDEX "Connection_status_idx"      ON "Connection"("status");

-- Create ConnectionService join table
CREATE TABLE "ConnectionService" (
  "connectionId" TEXT NOT NULL,
  "serviceId"    TEXT NOT NULL,

  CONSTRAINT "ConnectionService_pkey" PRIMARY KEY ("connectionId", "serviceId"),
  CONSTRAINT "ConnectionService_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE,
  CONSTRAINT "ConnectionService_serviceId_fkey"    FOREIGN KEY ("serviceId")    REFERENCES "Service"("id")   ON DELETE CASCADE
);

CREATE INDEX "ConnectionService_serviceId_idx" ON "ConnectionService"("serviceId");
