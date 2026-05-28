CREATE TABLE "DealEditRequest" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DealEditRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DealEditRequest_dealId_idx" ON "DealEditRequest"("dealId");

ALTER TABLE "DealEditRequest" ADD CONSTRAINT "DealEditRequest_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealEditRequest" ADD CONSTRAINT "DealEditRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
