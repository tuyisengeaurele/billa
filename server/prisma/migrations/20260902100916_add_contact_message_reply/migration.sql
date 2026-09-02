-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "replyMessage" TEXT;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
