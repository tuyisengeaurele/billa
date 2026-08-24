-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "publicToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE UNIQUE INDEX "Document_publicToken_key" ON "Document"("publicToken");
