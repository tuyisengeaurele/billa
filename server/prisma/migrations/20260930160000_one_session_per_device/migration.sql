-- One live session per device: each session now records which device it belongs to and when it was last used.
ALTER TABLE "RefreshToken" ADD COLUMN "deviceId" TEXT,
ADD COLUMN "deviceName" TEXT,
ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "RefreshToken_deviceId_idx" ON "RefreshToken"("deviceId");

-- Sessions made before this could not be matched to a device and piled up (switching business, signing in
-- again and signing out all left live rows behind), so they are ended once and everyone signs in again.
UPDATE "RefreshToken" SET "revokedAt" = NOW() WHERE "revokedAt" IS NULL;
