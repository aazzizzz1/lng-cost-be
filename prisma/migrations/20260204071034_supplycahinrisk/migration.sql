-- CreateTable
CREATE TABLE "RiskMatrix" (
    "id" SERIAL NOT NULL,
    "riskCode" TEXT NOT NULL,
    "variable" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskMatrix_riskCode_key" ON "RiskMatrix"("riskCode");
