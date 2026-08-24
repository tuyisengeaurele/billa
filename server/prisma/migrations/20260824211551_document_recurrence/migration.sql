-- CreateEnum
CREATE TYPE "RecurrenceInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "recurrenceInterval" "RecurrenceInterval",
ADD COLUMN     "recurrenceEndDate" TIMESTAMP(3),
ADD COLUMN     "nextRecurrenceAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Document_nextRecurrenceAt_idx" ON "Document"("nextRecurrenceAt");
