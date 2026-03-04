/*
  Warnings:

  - You are about to drop the column `demand` on the `SupplyChainRun` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SupplyChainRun" DROP COLUMN "demand";

-- CreateIndex
CREATE INDEX "DistanceRoute_origin_idx" ON "DistanceRoute"("origin");

-- CreateIndex
CREATE INDEX "DistanceRoute_destination_idx" ON "DistanceRoute"("destination");

-- CreateIndex
CREATE INDEX "Vessel_capacityM3_idx" ON "Vessel"("capacityM3");
