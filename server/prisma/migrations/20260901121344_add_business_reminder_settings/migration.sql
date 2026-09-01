-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "reminderCadenceDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
