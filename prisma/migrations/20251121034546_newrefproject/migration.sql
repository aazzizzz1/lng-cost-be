-- CreateIndex
CREATE INDEX "ConstructionCost_projectId_workcode_volume_idx" ON "ConstructionCost"("projectId", "workcode", "volume");

-- CreateIndex
CREATE INDEX "ConstructionCost_referenceProjectId_idx" ON "ConstructionCost"("referenceProjectId");

-- CreateIndex
CREATE INDEX "UnitPrice_projectId_workcode_volume_idx" ON "UnitPrice"("projectId", "workcode", "volume");
