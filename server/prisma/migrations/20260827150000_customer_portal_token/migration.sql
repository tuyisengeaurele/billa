-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "portalToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_portalToken_key" ON "Customer"("portalToken");
