-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- DataMigration: promote the current ADMIN_EMAILS-configured admin, if their account already exists
UPDATE "User" SET "isAdmin" = true WHERE "email" = 'audittest@example.com';
