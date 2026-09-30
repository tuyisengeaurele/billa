CREATE TABLE "ExchangeRate" (
    "currency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);
