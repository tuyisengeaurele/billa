-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "receiptImageUrl" TEXT,
ADD COLUMN     "referenceNumber" TEXT;
