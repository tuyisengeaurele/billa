-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "JobRunLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeeded" BOOLEAN NOT NULL,
    "resultCount" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "JobRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRunLog_jobName_ranAt_idx" ON "JobRunLog"("jobName", "ranAt");
