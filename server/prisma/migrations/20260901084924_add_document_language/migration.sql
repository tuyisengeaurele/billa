-- CreateEnum
CREATE TYPE "DocumentLanguage" AS ENUM ('EN', 'FR');

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "language" "DocumentLanguage" NOT NULL DEFAULT 'EN',
ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
