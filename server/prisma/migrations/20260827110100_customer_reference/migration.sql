-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "customerReference" TEXT,
ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
