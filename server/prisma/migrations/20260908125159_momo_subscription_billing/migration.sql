-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "portalToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "flutterwaveTxId",
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "phoneNumber" TEXT NOT NULL;

