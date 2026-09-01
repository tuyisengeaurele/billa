-- CreateEnum
CREATE TYPE "BusinessMemberRole" AS ENUM ('MEMBER', 'ACCOUNTANT');

-- AlterTable
ALTER TABLE "BusinessInvite" ADD COLUMN     "role" "BusinessMemberRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "BusinessMember" ADD COLUMN     "role" "BusinessMemberRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
