-- CreateEnum
CREATE TYPE "CBMExposurePolicy" AS ENUM ('SHELTERED_ONLY', 'SHELTERED_SEMI', 'ALL');

-- CreateTable
CREATE TABLE "mooring_rule_settings" (
    "id" SERIAL NOT NULL,
    "jettyMaxDepth" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "jettyMaxDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "cbmMinDepth" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "cbmMaxDepth" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "cbmExposurePolicy" "CBMExposurePolicy" NOT NULL DEFAULT 'SHELTERED_SEMI',
    "spreadMaxDepth" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "towerYokeMaxDepth" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "turretForPermanent" BOOLEAN NOT NULL DEFAULT true,
    "calmForVisiting" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mooring_rule_settings_pkey" PRIMARY KEY ("id")
);
