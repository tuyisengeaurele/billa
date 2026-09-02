-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "EmailSendLog" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSendLog_sentAt_idx" ON "EmailSendLog"("sentAt");
