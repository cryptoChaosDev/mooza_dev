-- ============ ORDERS ============
-- Customer-created briefs mirroring service offerings. titleNorm is a STORED
-- generated column (ё→е, lower) for ё/е-insensitive search — NEVER applied via
-- `prisma db push` (it would drop the GENERATED expression and silently empty
-- the search). Only `prisma migrate deploy`.

-- CreateTable: Order (without titleNorm; added as GENERATED below)
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "budgetFrom" INTEGER,
    "budgetTo" INTEGER,
    "deadline" TIMESTAMP(3),
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- Generated normalized title (ё→е, lower) for search — matches the *Norm pattern.
ALTER TABLE "Order" ADD COLUMN "titleNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("title", '')), 'ё', 'е')) STORED;

-- CreateIndex
CREATE INDEX "Order_authorId_idx" ON "Order"("authorId");
CREATE INDEX "Order_serviceId_idx" ON "Order"("serviceId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_deadline_idx" ON "Order"("deadline");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: OrderResponse
CREATE TABLE "OrderResponse" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "executorId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderResponse_orderId_idx" ON "OrderResponse"("orderId");
CREATE UNIQUE INDEX "OrderResponse_orderId_executorId_key" ON "OrderResponse"("orderId", "executorId");

-- AddForeignKey
ALTER TABLE "OrderResponse" ADD CONSTRAINT "OrderResponse_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderResponse" ADD CONSTRAINT "OrderResponse_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: OrderReferenceFile
CREATE TABLE "OrderReferenceFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReferenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderReferenceFile_orderId_idx" ON "OrderReferenceFile"("orderId");

-- AddForeignKey
ALTER TABLE "OrderReferenceFile" ADD CONSTRAINT "OrderReferenceFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: OrderReferenceLink
CREATE TABLE "OrderReferenceLink" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReferenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderReferenceLink_orderId_idx" ON "OrderReferenceLink"("orderId");

-- AddForeignKey
ALTER TABLE "OrderReferenceLink" ADD CONSTRAINT "OrderReferenceLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: implicit M2M between CustomFilterValue and Order (Prisma convention:
-- alphabetical, so table = _CustomFilterValueToOrder, A=CustomFilterValue, B=Order).
CREATE TABLE "_CustomFilterValueToOrder" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CustomFilterValueToOrder_AB_unique" ON "_CustomFilterValueToOrder"("A", "B");
CREATE INDEX "_CustomFilterValueToOrder_B_index" ON "_CustomFilterValueToOrder"("B");

-- AddForeignKey
ALTER TABLE "_CustomFilterValueToOrder" ADD CONSTRAINT "_CustomFilterValueToOrder_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomFilterValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CustomFilterValueToOrder" ADD CONSTRAINT "_CustomFilterValueToOrder_B_fkey" FOREIGN KEY ("B") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link posts to the order they advertise (type='order'); SET NULL so deleting an
-- order leaves its feed post orphaned-but-intact (consistent with serviceId).
ALTER TABLE "Post" ADD COLUMN "orderId" TEXT;
CREATE INDEX "Post_orderId_idx" ON "Post"("orderId");
ALTER TABLE "Post" ADD CONSTRAINT "Post_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
