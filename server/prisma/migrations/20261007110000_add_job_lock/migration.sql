CREATE TABLE "JobLock" (
    "name" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("name")
);
