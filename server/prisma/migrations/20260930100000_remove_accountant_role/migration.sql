-- The read-only accountant role is gone; a business now has an owner and members.
-- Fail closed: anyone who was an accountant loses access instead of quietly becoming
-- a member who can write. The owner can invite them again as a member.
DELETE FROM "BusinessMember" WHERE "role" = 'ACCOUNTANT';
DELETE FROM "BusinessInvite" WHERE "role" = 'ACCOUNTANT';

ALTER TYPE "BusinessMemberRole" RENAME TO "BusinessMemberRole_old";
CREATE TYPE "BusinessMemberRole" AS ENUM ('MEMBER');

ALTER TABLE "BusinessMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "BusinessMember" ALTER COLUMN "role" TYPE "BusinessMemberRole" USING ("role"::text::"BusinessMemberRole");
ALTER TABLE "BusinessMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

ALTER TABLE "BusinessInvite" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "BusinessInvite" ALTER COLUMN "role" TYPE "BusinessMemberRole" USING ("role"::text::"BusinessMemberRole");
ALTER TABLE "BusinessInvite" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

DROP TYPE "BusinessMemberRole_old";
