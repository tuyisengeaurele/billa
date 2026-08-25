-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "referencedDocumentId" TEXT,
ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE INDEX "Document_referencedDocumentId_idx" ON "Document"("referencedDocumentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_referencedDocumentId_fkey" FOREIGN KEY ("referencedDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
