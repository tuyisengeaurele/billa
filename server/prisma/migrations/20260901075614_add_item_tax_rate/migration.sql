-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18;
