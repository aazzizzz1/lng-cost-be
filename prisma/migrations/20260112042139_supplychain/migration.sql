-- CreateTable
CREATE TABLE "Vessel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "capacityM3" DOUBLE PRECISION NOT NULL,
    "speedKnot" DOUBLE PRECISION NOT NULL,
    "rentPerDayUSD" DOUBLE PRECISION NOT NULL,
    "voyageTonPerDay" DOUBLE PRECISION NOT NULL,
    "ballastTonPerDay" DOUBLE PRECISION NOT NULL,
    "berthTonPerDay" DOUBLE PRECISION NOT NULL,
    "portCostLTP" DOUBLE PRECISION NOT NULL,
    "portCostDelay" DOUBLE PRECISION NOT NULL,
    "portCostPerLocation" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistanceRoute" (
    "id" SERIAL NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "nauticalMiles" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistanceRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OruCapex" (
    "id" SERIAL NOT NULL,
    "plantName" TEXT NOT NULL,
    "fixCapexUSD" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OruCapex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyChainScenario" (
    "id" SERIAL NOT NULL,
    "runKey" TEXT NOT NULL,
    "terminal" TEXT NOT NULL,
    "locations" JSONB NOT NULL,
    "params" JSONB NOT NULL,
    "demand" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyChainScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyChainRun" (
    "id" SERIAL NOT NULL,
    "runKey" TEXT NOT NULL,
    "scenarioId" INTEGER,
    "terminal" TEXT NOT NULL,
    "locations" JSONB NOT NULL,
    "params" JSONB NOT NULL,
    "demand" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "topResult" JSONB,
    "reuseCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyChainRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_name_key" ON "Vessel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DistanceRoute_origin_destination_key" ON "DistanceRoute"("origin", "destination");

-- CreateIndex
CREATE UNIQUE INDEX "OruCapex_plantName_key" ON "OruCapex"("plantName");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyChainScenario_runKey_key" ON "SupplyChainScenario"("runKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyChainRun_runKey_key" ON "SupplyChainRun"("runKey");

-- CreateIndex
CREATE INDEX "SupplyChainRun_scenarioId_idx" ON "SupplyChainRun"("scenarioId");

-- AddForeignKey
ALTER TABLE "SupplyChainRun" ADD CONSTRAINT "SupplyChainRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "SupplyChainScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
