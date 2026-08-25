-- Collapse the three document templates (MINIMAL, FORMAL, SIDEBAR_ACCENT) down to two
-- (MINIMAL, PREMIUM). FORMAL becomes PREMIUM; any business/document still on the removed
-- SIDEBAR_ACCENT template is moved to PREMIUM too, before the enum value is dropped.

ALTER TYPE "DocumentTemplate" RENAME VALUE 'FORMAL' TO 'PREMIUM';

UPDATE "Business" SET "defaultTemplate" = 'PREMIUM' WHERE "defaultTemplate" = 'SIDEBAR_ACCENT';
UPDATE "Document" SET "template" = 'PREMIUM' WHERE "template" = 'SIDEBAR_ACCENT';

ALTER TYPE "DocumentTemplate" RENAME TO "DocumentTemplate_old";
CREATE TYPE "DocumentTemplate" AS ENUM ('MINIMAL', 'PREMIUM');

ALTER TABLE "Business" ALTER COLUMN "defaultTemplate" DROP DEFAULT;
ALTER TABLE "Business" ALTER COLUMN "defaultTemplate" TYPE "DocumentTemplate" USING ("defaultTemplate"::text::"DocumentTemplate");
ALTER TABLE "Business" ALTER COLUMN "defaultTemplate" SET DEFAULT 'MINIMAL';

ALTER TABLE "Document" ALTER COLUMN "template" TYPE "DocumentTemplate" USING ("template"::text::"DocumentTemplate");

DROP TYPE "DocumentTemplate_old";
