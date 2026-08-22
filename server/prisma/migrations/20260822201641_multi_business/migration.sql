-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_businessId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_businessId_fkey";

-- DropIndex
DROP INDEX "Payment_businessId_idx";

-- DropIndex
DROP INDEX "User_businessId_idx";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "currentPeriodEnd",
DROP COLUMN "plan",
DROP COLUMN "trialEndsAt",
ADD COLUMN     "ownerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "businessId";

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "businessId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "businessId",
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "lastActiveBusinessId" TEXT,
ADD COLUMN     "plan" "SubscriptionPlan",
ADD COLUMN     "trialEndsAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Business_ownerId_idx" ON "Business"("ownerId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

