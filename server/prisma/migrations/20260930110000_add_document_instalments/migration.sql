-- CreateTable
CREATE TABLE "DocumentInstalment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentInstalment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentInstalment_documentId_idx" ON "DocumentInstalment"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentInstalment" ADD CONSTRAINT "DocumentInstalment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
