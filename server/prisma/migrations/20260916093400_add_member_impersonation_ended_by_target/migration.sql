-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'MEMBER_IMPERSONATION_ENDED_BY_TARGET';

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
