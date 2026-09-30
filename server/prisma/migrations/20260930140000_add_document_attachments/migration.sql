CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentAttachment_documentId_idx" ON "DocumentAttachment"("documentId");

ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
