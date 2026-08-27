-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "declinedAt" TIMESTAMP(3),
ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
