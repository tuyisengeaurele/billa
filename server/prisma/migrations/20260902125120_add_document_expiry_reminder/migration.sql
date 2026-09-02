-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "expiryReminderSentAt" TIMESTAMP(3),
ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
