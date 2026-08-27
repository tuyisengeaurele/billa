-- CreateEnum
CREATE TYPE "ImpersonationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'OVERRIDDEN');

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'MEMBER_IMPERSONATION_STARTED';

-- CreateTable
CREATE TABLE "ImpersonationRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ImpersonationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "overrideReason" TEXT,

    CONSTRAINT "ImpersonationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImpersonationRequest_targetUserId_status_idx" ON "ImpersonationRequest"("targetUserId", "status");

-- CreateIndex
CREATE INDEX "ImpersonationRequest_requesterId_status_idx" ON "ImpersonationRequest"("requesterId", "status");

-- AddForeignKey
ALTER TABLE "ImpersonationRequest" ADD CONSTRAINT "ImpersonationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationRequest" ADD CONSTRAINT "ImpersonationRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationRequest" ADD CONSTRAINT "ImpersonationRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
