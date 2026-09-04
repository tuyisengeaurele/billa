/*
  Warnings:

  - You are about to drop the column `assignedToId` on the `Customer` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_assignedToId_fkey";

-- DropIndex
DROP INDEX "Customer_assignedToId_idx";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "assignedToId",
ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
