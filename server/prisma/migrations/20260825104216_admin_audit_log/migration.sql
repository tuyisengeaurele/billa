-- CreateTable
CREATE TABLE "AdminAuditLogEntry" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLogEntry_createdAt_idx" ON "AdminAuditLogEntry"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLogEntry_adminUserId_idx" ON "AdminAuditLogEntry"("adminUserId");

-- AddForeignKey
ALTER TABLE "AdminAuditLogEntry" ADD CONSTRAINT "AdminAuditLogEntry_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
