-- CreateEnum
CREATE TYPE "MomoRequestStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "momoApiKeyEnc" TEXT,
ADD COLUMN     "momoApiUserEnc" TEXT,
ADD COLUMN     "momoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "momoEnvironment" TEXT,
ADD COLUMN     "momoSubscriptionKeyEnc" TEXT,
ADD COLUMN     "momoTargetEnvironment" TEXT;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "momoPaymentRequestId" TEXT;

-- CreateTable
CREATE TABLE "MomoPaymentRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "MomoRequestStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MomoPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MomoPaymentRequest_referenceId_key" ON "MomoPaymentRequest"("referenceId");

-- CreateIndex
CREATE INDEX "MomoPaymentRequest_businessId_idx" ON "MomoPaymentRequest"("businessId");

-- CreateIndex
CREATE INDEX "MomoPaymentRequest_documentId_idx" ON "MomoPaymentRequest"("documentId");

-- CreateIndex
CREATE INDEX "MomoPaymentRequest_status_idx" ON "MomoPaymentRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_momoPaymentRequestId_key" ON "InvoicePayment"("momoPaymentRequestId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_momoPaymentRequestId_fkey" FOREIGN KEY ("momoPaymentRequestId") REFERENCES "MomoPaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomoPaymentRequest" ADD CONSTRAINT "MomoPaymentRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomoPaymentRequest" ADD CONSTRAINT "MomoPaymentRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

