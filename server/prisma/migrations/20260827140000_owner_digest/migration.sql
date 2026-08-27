-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "lastDigestSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
