-- CreateTable
CREATE TABLE "CalculatorTotalCost" (
    "id" SERIAL NOT NULL,
    "infrastructure" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "year" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "information" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalculatorTotalCost_pkey" PRIMARY KEY ("id")
);
